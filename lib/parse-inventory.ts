// Best-effort parser for a broker's inventory spreadsheet (Excel/CSV or a
// public Google Sheet export). There's no standard column format across
// brokers, so this leans on a few conventions we've seen in practice
// (Chrome Stallions' sheets, which are representative of how these lists
// tend to look): a combined "Model" cell like "2021 Taycan Turbo S (217k)
// CPO", a combined "Term" cell like "24 mo/ 7500 mi/ $5000 drive off", and
// a combined "Spec" cell like "Chalk x black" for exterior x interior.
//
// When an ANTHROPIC_API_KEY is configured, an AI pass (lib/ai-parse-inventory.ts)
// is tried first, since brokers format these sheets wildly differently and a
// hand-written parser can't keep up with all of them. The heuristic parsing
// below is the fallback (no key configured, or the AI call fails) and also
// the model this whole module was originally built around — it's free to
// run, fast, and good enough for the fairly formulaic way these sheets get
// written. Rows it can't confidently parse are skipped and reported back
// rather than guessed at, so nothing wrong ends up in a broker's queue.
import { createHash } from "node:crypto";
import { readWorkbookTabs, rowNumber, type SheetTab } from "./google-sheet";
import { mapLimit } from "./concurrency";
import { moveProgramsToIncentives, normalizeModelTrim, splitProgramsFromTrim } from "@/lib/vehicle-names";
import type { VehicleCondition } from "./deals-data";

export interface ParsedDeal {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  msrp: number;
  // The vehicle's total price (all dealer fees and add-ons, before rebates;
  // without taxes, government fees or the doc fee), when the
  // source states it (shown on the listing; required for dealership
  // listings under California's CARS Act).
  sellingPrice?: number | null;
  payment: number;
  term: number;
  milesPerYear: number | null;
  dueAtSigning: number;
  exterior: string | null;
  interior: string | null;
  brokerFee: number | null;
  // Multiple security deposits the payment assumes, and their refundable
  // total (see supabase/migrations/0020_msds.sql). Optional — most sources
  // don't have them.
  msdCount?: number | null;
  msdTotal?: number | null;
  state: string | null;
  // Where the car is, as the source names it ("SoCal", "Phoenix"), and
  // whether it ships — optional; staging falls back to the broker's city.
  city?: string | null;
  delivery?: "pickup" | "in_state" | "nationwide" | null;
  notes: string;
  // "Loaner", "Demo", "CPO" or "Used" when the source says so (shown as a
  // tag on the deal card); null otherwise.
  condition?: VehicleCondition | null;
  // One-pay lease: a single upfront lump sum (stored in dueAtSigning) with
  // no separate monthly bill. payment is 0 by convention when this is true,
  // same as the manual "Add a car" forms.
  onePay: boolean;
  // Incentives the source gives a value for — a dollar amount and/or a
  // monthly difference like "no Loyalty +$15" — read by the AI parse
  // exactly as stated (never looked up or estimated), plus programs the
  // price requires with no stated value (amount 0, includedInPrice true).
  incentives?: { name: string; amount: number; includedInPrice: boolean; monthly?: number }[];
  // Other mileage tiers the source prices, e.g. "10k +$23 · 12k +$45".
  mileageOptions?: { milesPerYear: number; monthlyDelta: number }[];
  // Other lease terms priced for the same car, e.g. "36/10k $356" next to
  // a main "24/7500 $330".
  leaseOptions?: { term: number; milesPerYear: number | null; payment: number }[];
  // Where a spreadsheet row came from: its sheet row number and tab name
  // (see parseTabs). Synced sheets store the tab on the deal so a broker
  // can switch a tab off.
  sourceRow?: number;
  sheetTab?: string | null;
}

export interface SkippedRow {
  row: number;
  tab?: string;
  reason: string;
  // Whatever fields the parser DID manage to read before hitting one it
  // couldn't determine (e.g. everything but MSRP) — carried through so the
  // manual fallback form can pre-fill these instead of coming up entirely
  // blank and making the broker retype a row that was 90% readable.
  partial: Partial<ParsedDeal>;
}

export interface ParseResult {
  parsed: ParsedDeal[];
  skipped: SkippedRow[];
}

// A best-effort identity for a parsed row, used to match a sheet row to an
// existing listing across recurring sync runs (see lib/sheet-sync.ts) without
// requiring brokers to add a VIN or stock number column. Two rows with the
// same year/make/model/trim/payment/due-at-signing are treated as "the same
// car" — good enough in practice, though a broker who lists several
// identical units at the same price will see them treated as
// interchangeable rather than individually tracked.
export function computeMatchSignature(d: {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  payment: number;
  dueAtSigning: number;
}): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const car = normalizeModelTrim({ make: d.make, model: d.model, trim: splitProgramsFromTrim(d.trim).trim });
  return [d.year, norm(car.make), norm(car.model), norm(car.trim), Math.round(d.payment), Math.round(d.dueAtSigning)].join(
    "|"
  );
}

// Known model name -> make, longest-key-first matching against the
// "Model" cell. Covers what we've seen from brokers so far; easy to extend.
const MODEL_MAKE: [string, string][] = [
  ["RANGE ROVER EVOQUE", "Land Rover"],
  ["RANGE ROVER VELAR", "Land Rover"],
  ["RANGE ROVER SPORT", "Land Rover"],
  ["RANGE ROVER", "Land Rover"],
  ["DEFENDER", "Land Rover"],
  ["DISCOVERY", "Land Rover"],
  ["BENTAYGA", "Bentley"],
  ["CONTINENTAL GT", "Bentley"],
  ["FLYING SPUR", "Bentley"],
  ["URUS", "Lamborghini"],
  ["HURACAN", "Lamborghini"],
  ["TAYCAN", "Porsche"],
  ["CAYENNE", "Porsche"],
  ["PANAMERA", "Porsche"],
  ["MACAN", "Porsche"],
  ["911", "Porsche"],
  ["CARRERA", "Porsche"],
  ["CABRIOLET", "Porsche"],
  ["X5", "BMW"],
  ["X3", "BMW"],
  ["X7", "BMW"],
  ["X1", "BMW"],
  ["I4", "BMW"],
  ["I7", "BMW"],
  ["IX", "BMW"],
  ["740I", "BMW"],
  ["330I", "BMW"],
  ["530I", "BMW"],
  ["M3", "BMW"],
  ["M4", "BMW"],
  ["GLC", "Mercedes-Benz"],
  ["GLE", "Mercedes-Benz"],
  ["GLS", "Mercedes-Benz"],
  ["GLB", "Mercedes-Benz"],
  ["C300", "Mercedes-Benz"],
  ["CLE", "Mercedes-Benz"],
  ["E350", "Mercedes-Benz"],
  ["S-CLASS", "Mercedes-Benz"],
  ["A5", "Audi"],
  ["S5", "Audi"],
  ["A4", "Audi"],
  ["Q5", "Audi"],
  ["Q7", "Audi"],
  ["MODEL 3", "Tesla"],
  ["MODEL Y", "Tesla"],
  ["MODEL S", "Tesla"],
  ["MODEL X", "Tesla"],
];

// Common shorthand regions -> state code. Falls back to the broker's own
// profile state when nothing matches.
const REGION_STATE: Record<string, string> = {
  socal: "CA",
  norcal: "CA",
  "so cal": "CA",
  "no cal": "CA",
  california: "CA",
  ca: "CA",
  nyc: "NY",
  "new york": "NY",
  dfw: "TX",
  texas: "TX",
  florida: "FL",
  fl: "FL",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, "");
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => [h, normalizeHeader(h)] as const);
  for (const candidate of candidates) {
    const hit = normalized.find(([, n]) => n.includes(candidate));
    if (hit) return hit[0];
  }
  return null;
}

function firstNumber(text: string): number | null {
  const match = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseModelCell(text: string): {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  msrp: number | null;
  conditionNote: string | null;
  condition: VehicleCondition | null;
} {
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;

  // Tolerate typos after the "k" (e.g. "127kl)" instead of "127k)") — only
  // the digits before "k" actually matter.
  const msrpMatch = text.match(/\(\s*(\d+(?:\.\d+)?)\s*k[a-z]*\s*\)/i);
  const msrp = msrpMatch ? Math.round(Number(msrpMatch[1]) * 1000) : null;

  let conditionNote: string | null = null;
  let condition: VehicleCondition | null = null;
  if (/\bCPO\b/i.test(text)) [conditionNote, condition] = ["Certified pre-owned (CPO).", "CPO"];
  else if (/\bloaner\b/i.test(text)) [conditionNote, condition] = ["Former loaner unit.", "Loaner"];
  else if (/\bdemo\b/i.test(text)) [conditionNote, condition] = ["Demo unit.", "Demo"];

  const upper = text.toUpperCase();
  let make: string | null = null;
  let model: string | null = null;
  for (const [key, mk] of MODEL_MAKE) {
    if (upper.includes(key)) {
      make = mk;
      model = key
        .split(" ")
        .map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase()))
        .join(" ");
      break;
    }
  }

  // Whatever's left after stripping the year, MSRP parens, condition
  // words, and the matched model name becomes the trim.
  let rest = text
    .replace(/\b(19|20)\d{2}\b/, "")
    .replace(/\(\s*\d+(?:\.\d+)?\s*k[a-z]*\s*\)/i, "")
    .replace(/\bCPO\b/i, "")
    .replace(/\bloaner\b/i, "")
    .replace(/\bdemo\b/i, "");
  if (model) {
    const re = new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    rest = rest.replace(re, "");
  }
  const trim = rest.replace(/\s+/g, " ").trim() || null;

  return { year, make, model, trim, msrp, conditionNote, condition };
}

function parseTermCell(text: string): {
  term: number | null;
  milesPerYear: number | null;
  dueAtSigning: number | null;
} {
  const termMatch = text.match(/(\d+)\s*mo/i);
  const milesMatch = text.match(/(\d+)\s*mi/i);
  const dueMatch = text.match(/\$?\s*([\d,]+)\s*(drive[\s-]?off|due|down)/i);
  return {
    term: termMatch ? Number(termMatch[1]) : null,
    milesPerYear: milesMatch ? Number(milesMatch[1]) : null,
    dueAtSigning: dueMatch ? Number(dueMatch[1].replace(/,/g, "")) : null,
  };
}

function parseSpecCell(text: string): { exterior: string | null; interior: string | null } {
  const parts = text.split(/\s+x\s+/i);
  if (parts.length >= 2) {
    return { exterior: parts[0].trim(), interior: parts[1].trim() };
  }
  return { exterior: text.trim() || null, interior: null };
}

function parseLocationCell(text: string, fallbackState: string): string {
  const key = text.trim().toLowerCase();
  return REGION_STATE[key] ?? fallbackState;
}

// ---------------------------------------------------------------------------
// Whole workbooks: every tab, in batches, with a per-row cache
// ---------------------------------------------------------------------------

// Rows sent to the AI per call. A call returns at most a few thousand
// tokens of listings, so a 200-car sheet is read as ~10 batches in parallel.
const ROWS_PER_BATCH = 20;
const PARALLEL_BATCHES = 6;

// What a row parsed to last time (sheet syncs keep this between runs, so
// only new or changed rows are read again): its listings and skipped rows.
export type RowParseCache = Record<string, { p: ParsedDeal[]; s: SkippedRow[] }>;
// Kept per tab, so a tab that's switched off keeps its cache for when it's
// switched back on.
export type TabRowCache = Record<string, RowParseCache>;

export interface TabsParseResult extends ParseResult {
  // Only the tabs that were read.
  cache: TabRowCache;
  rowsRead: number;
}

function cellValues(row: Record<string, unknown>): string[] {
  return Object.values(row).map((v) => String(v ?? "").trim());
}

// A row with only a cell or two filled in: a banner ("SoCal — pick-up
// only"), a section title or a note, which can apply to the cars below it.
function isNoteRow(row: Record<string, unknown>): boolean {
  return cellValues(row).filter(Boolean).length < 3;
}

function hash(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("base64url");
}

// Reads every listing from every tab. Each tab is split into batches read
// in parallel; a batch's banner/note rows from the rest of the tab ride
// along as context. Rows found in `cache` (same content, same tab notes,
// same headers) reuse their earlier result instead of being read again.
export async function parseTabs(
  tabs: SheetTab[],
  brokerState: string,
  cache: TabRowCache = {}
): Promise<TabsParseResult> {
  const nextCache: TabRowCache = {};
  const parsed: ParsedDeal[] = [];
  const skipped: SkippedRow[] = [];
  const batches: { tab: string; rows: Record<string, unknown>[]; ids: number[]; keys: string[]; context: string }[] = [];
  let rowsRead = 0;

  for (const tab of tabs) {
    if (tab.rows.length === 0) continue;
    rowsRead += tab.rows.length;
    const headers = Object.keys(tab.rows[0]);
    const notes = tab.rows.filter(isNoteRow);
    const context = notes.map((r) => `row ${rowNumber(r)}: ${cellValues(r).filter(Boolean).join(" | ")}`).join("\n");
    const notesKey = hash(notes.map(cellValues));

    let pending: { row: Record<string, unknown>; id: number; key: string }[] = [];
    const flush = () => {
      if (pending.length === 0) return;
      batches.push({
        tab: tab.name,
        rows: pending.map((p) => p.row),
        ids: pending.map((p) => p.id),
        keys: pending.map((p) => p.key),
        context,
      });
      pending = [];
    };
    const tabCache = cache[tab.name] ?? {};
    const nextTabCache: RowParseCache = (nextCache[tab.name] = {});
    for (const [i, row] of tab.rows.entries()) {
      const id = rowNumber(row) > 0 ? rowNumber(row) : i + 2;
      const key = hash([brokerState, headers, notesKey, cellValues(row)]);
      const hit = tabCache[key];
      if (hit) {
        nextTabCache[key] = hit;
        parsed.push(...hit.p.map((d) => ({ ...d, sourceRow: id, sheetTab: tab.name })));
        skipped.push(...hit.s.map((r) => ({ ...r, row: id, tab: tab.name })));
        continue;
      }
      pending.push({ row, id, key });
      if (pending.length >= ROWS_PER_BATCH) flush();
    }
    flush();
  }

  // Loaded once up front — batches start together.
  const ai = process.env.ANTHROPIC_API_KEY && batches.length ? await import("./ai-parse-inventory") : null;
  const results = await mapLimit(batches, PARALLEL_BATCHES, async (b) => {
    const { result, attributed } = await parseBatch(ai?.parseRowsWithAI ?? null, b.rows, b.ids, b.context, brokerState);
    return { b, result, attributed };
  });

  for (const { b, result, attributed } of results) {
    parsed.push(...result.parsed.map((d) => ({ ...d, sheetTab: b.tab })));
    skipped.push(...result.skipped.map((r) => ({ ...r, tab: b.tab })));
    // Only cache when every listing is tied to a row — otherwise a row could
    // be remembered as "no cars" when its car just wasn't labeled.
    if (!attributed) continue;
    b.ids.forEach((id, i) => {
      (nextCache[b.tab] ??= {})[b.keys[i]] = {
        p: result.parsed.filter((d) => d.sourceRow === id).map(stripSource),
        s: result.skipped.filter((r) => r.row === id).map(({ row, reason, partial }) => ({ row, reason, partial })),
      };
    });
  }

  return { parsed, skipped, cache: nextCache, rowsRead };
}

function stripSource(d: ParsedDeal): ParsedDeal {
  const copy = { ...d };
  delete copy.sourceRow;
  delete copy.sheetTab;
  return copy;
}

// One batch: the AI pass when it's configured, the heuristic parser as the
// fallback (no key, an API error, or nothing usable back for rows that look
// like cars). `attributed` is true when the result can be cached per row.
async function parseBatch(
  parseRowsWithAI: typeof import("./ai-parse-inventory").parseRowsWithAI | null,
  rows: Record<string, unknown>[],
  ids: number[],
  context: string,
  brokerState: string
): Promise<{ result: ParseResult; attributed: boolean }> {
  if (parseRowsWithAI) {
    try {
      const result = await parseRowsWithAI(rows, brokerState, { rowIds: ids, context: context || undefined });
      const idSet = new Set(ids);
      const attributed =
        result.parsed.every((d) => d.sourceRow != null && idSet.has(d.sourceRow)) &&
        result.skipped.every((r) => idSet.has(r.row));
      if (result.parsed.length > 0 || result.skipped.length > 0 || rows.every(isNoteRow)) {
        return { result, attributed };
      }
    } catch (err) {
      console.error("AI inventory parsing failed for a batch, falling back to heuristic parser:", err);
    }
  }
  const result = parseRows(rows, brokerState);
  // The heuristic parser numbers rows as if the batch started at sheet row
  // 2 (under the header); map back to the real sheet rows.
  return {
    result: { parsed: result.parsed, skipped: result.skipped.map((r) => ({ ...r, row: ids[r.row - 2] ?? r.row })) },
    attributed: false,
  };
}

// An uploaded Excel/CSV file: every visible tab.
export async function parseInventoryBuffer(buffer: ArrayBuffer, brokerState: string): Promise<ParseResult> {
  const { parsed, skipped } = await parseTabs(readWorkbookTabs(buffer), brokerState);
  return { parsed: parsed.map((d) => moveProgramsToIncentives(normalizeModelTrim(d))), skipped };
}

// Multiple security deposits written into a listing's text: "w/ 7 MSDs",
// "7 MSD", "7x MSD", and optionally a total like "$6,300 MSD" /
// "MSDs $6,300". A count outside 1-20 isn't an MSD count.
export function parseMsdText(text: string): { msdCount: number | null; msdTotal: number | null } {
  const count = text.match(/\b(\d{1,2})\s*x?\s*msds?\b/i);
  const msdCount = count && Number(count[1]) >= 1 && Number(count[1]) <= 20 ? Number(count[1]) : null;
  const total =
    text.match(/\$\s*([\d,]{3,})\s*(?:total\s*)?(?:in\s*)?msds?\b/i) ??
    text.match(/\bmsds?\s*(?:total\s*)?(?:of\s*|=\s*|:\s*|\(\s*)?\$\s*([\d,]{3,})/i);
  const msdTotal = total ? Number(total[1].replace(/,/g, "")) : null;
  return { msdCount, msdTotal: msdCount != null && msdTotal != null && msdTotal > 0 ? msdTotal : null };
}

function parseRows(rows: Record<string, unknown>[], brokerState: string): ParseResult {
  if (rows.length === 0) return { parsed: [], skipped: [] };

  const headers = Object.keys(rows[0]);
  const modelCol = findColumn(headers, ["model", "vehicle", "car"]);
  const paymentCol = findColumn(headers, ["payment", "monthly"]);
  const termCol = findColumn(headers, ["term"]);
  const specCol = findColumn(headers, ["spec", "color"]);
  const locationCol = findColumn(headers, ["location", "state", "region"]);
  const feeCol = findColumn(headers, ["fee"]);

  const parsed: ParsedDeal[] = [];
  const skipped: SkippedRow[] = [];

  rows.forEach((row, idx) => {
    const modelText = modelCol ? String(row[modelCol] ?? "").trim() : "";
    const paymentText = paymentCol ? String(row[paymentCol] ?? "").trim() : "";
    const termText = termCol ? String(row[termCol] ?? "").trim() : "";
    const specText = specCol ? String(row[specCol] ?? "").trim() : "";
    const locationText = locationCol ? String(row[locationCol] ?? "").trim() : "";
    const feeText = feeCol ? String(row[feeCol] ?? "").trim() : "";

    if (!modelText && !paymentText && !termText) return; // blank row, skip silently

    // A one-pay lease has no monthly payment — the "payment" cell instead
    // holds the single upfront total (often flagged with the word
    // "ONEPAY"/"one-pay"), which becomes dueAtSigning below.
    const onePay = /\bone[\s-]?pay\b/i.test(paymentText) || /\bone[\s-]?pay\b/i.test(termText);

    const { year, make, model, trim, msrp, conditionNote, condition } = parseModelCell(modelText);
    const payment = onePay ? 0 : firstNumber(paymentText);
    const { term, milesPerYear, dueAtSigning: dueFromTerm } = parseTermCell(termText);
    const dueAtSigning = onePay ? firstNumber(paymentText) : dueFromTerm;
    const { exterior, interior } = parseSpecCell(specText);
    const state = locationText ? parseLocationCell(locationText, brokerState) : brokerState;
    const fee = feeText ? firstNumber(feeText) : null;
    const msd = parseMsdText(Object.values(row).map(String).join(" "));

    const missing: string[] = [];
    if (!year) missing.push("year");
    if (!make || !model) missing.push("make/model (unrecognized)");
    if (!msrp) missing.push("MSRP");
    if (!onePay && !payment) missing.push("payment");
    if (!term) missing.push("term");
    if (!dueAtSigning) missing.push("due at signing");

    const notes = [conditionNote].filter(Boolean).join(" ");

    if (missing.length > 0) {
      const partial: Partial<ParsedDeal> = { onePay };
      if (year) partial.year = year;
      if (make) partial.make = make;
      if (model) partial.model = model;
      if (trim) partial.trim = trim;
      if (msrp) partial.msrp = msrp;
      if (!onePay && payment) partial.payment = payment;
      if (term) partial.term = term;
      if (milesPerYear) partial.milesPerYear = milesPerYear;
      if (dueAtSigning) partial.dueAtSigning = dueAtSigning;
      if (exterior) partial.exterior = exterior;
      if (interior) partial.interior = interior;
      if (fee) partial.brokerFee = fee;
      if (msd.msdCount) partial.msdCount = msd.msdCount;
      if (msd.msdTotal) partial.msdTotal = msd.msdTotal;
      if (state) partial.state = state;
      if (notes) partial.notes = notes;
      skipped.push({ row: idx + 2, reason: `Couldn't determine: ${missing.join(", ")}`, partial });
      return;
    }

    parsed.push({
      year: year!,
      make: make!,
      model: model!,
      trim,
      msrp: msrp!,
      payment: payment ?? 0,
      term: term!,
      milesPerYear,
      dueAtSigning: dueAtSigning!,
      exterior,
      interior,
      brokerFee: fee,
      msdCount: msd.msdCount,
      msdTotal: msd.msdTotal,
      state,
      notes,
      condition,
      onePay,
    });
  });

  return { parsed: parsed.map((d) => moveProgramsToIncentives(normalizeModelTrim(d))), skipped };
}
