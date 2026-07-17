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
import * as XLSX from "xlsx";

export interface ParsedDeal {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  msrp: number;
  payment: number;
  term: number;
  milesPerYear: number | null;
  dueAtSigning: number;
  exterior: string | null;
  interior: string | null;
  state: string | null;
  notes: string;
}

export interface ParseResult {
  parsed: ParsedDeal[];
  skipped: { row: number; reason: string }[];
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
} {
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? Number(yearMatch[0]) : null;

  // Tolerate typos after the "k" (e.g. "127kl)" instead of "127k)") — only
  // the digits before "k" actually matter.
  const msrpMatch = text.match(/\(\s*(\d+(?:\.\d+)?)\s*k[a-z]*\s*\)/i);
  const msrp = msrpMatch ? Math.round(Number(msrpMatch[1]) * 1000) : null;

  let conditionNote: string | null = null;
  if (/\bCPO\b/i.test(text)) conditionNote = "Certified pre-owned (CPO).";
  else if (/\bloaner\b/i.test(text)) conditionNote = "Former loaner unit.";
  else if (/\bdemo\b/i.test(text)) conditionNote = "Demo unit.";

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

  return { year, make, model, trim, msrp, conditionNote };
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

async function parseRowsWithAiOrHeuristic(
  rows: Record<string, unknown>[],
  brokerState: string
): Promise<ParseResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { parseRowsWithAI } = await import("./ai-parse-inventory");
      const result = await parseRowsWithAI(rows, brokerState);
      if (result.parsed.length > 0 || result.skipped.length > 0) return result;
      // AI returned nothing usable — fall through to the heuristic pass
      // rather than reporting an empty result.
    } catch (err) {
      console.error("AI inventory parsing failed, falling back to heuristic parser:", err);
    }
  }
  return parseRows(rows, brokerState);
}

export async function parseInventoryBuffer(
  buffer: ArrayBuffer,
  brokerState: string
): Promise<ParseResult> {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return parseRowsWithAiOrHeuristic(rows, brokerState);
}

export async function parseInventoryCsv(
  csvText: string,
  brokerState: string
): Promise<ParseResult> {
  const workbook = XLSX.read(csvText, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return parseRowsWithAiOrHeuristic(rows, brokerState);
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
  const skipped: { row: number; reason: string }[] = [];

  rows.forEach((row, idx) => {
    const modelText = modelCol ? String(row[modelCol] ?? "").trim() : "";
    const paymentText = paymentCol ? String(row[paymentCol] ?? "").trim() : "";
    const termText = termCol ? String(row[termCol] ?? "").trim() : "";
    const specText = specCol ? String(row[specCol] ?? "").trim() : "";
    const locationText = locationCol ? String(row[locationCol] ?? "").trim() : "";
    const feeText = feeCol ? String(row[feeCol] ?? "").trim() : "";

    if (!modelText && !paymentText && !termText) return; // blank row, skip silently

    const { year, make, model, trim, msrp, conditionNote } = parseModelCell(modelText);
    const payment = firstNumber(paymentText);
    const { term, milesPerYear, dueAtSigning } = parseTermCell(termText);
    const { exterior, interior } = parseSpecCell(specText);
    const state = locationText ? parseLocationCell(locationText, brokerState) : brokerState;
    const fee = feeText ? firstNumber(feeText) : null;

    const missing: string[] = [];
    if (!year) missing.push("year");
    if (!make || !model) missing.push("make/model (unrecognized)");
    if (!msrp) missing.push("MSRP");
    if (!payment) missing.push("payment");
    if (!term) missing.push("term");
    if (!dueAtSigning) missing.push("due at signing");

    if (missing.length > 0) {
      skipped.push({ row: idx + 2, reason: `Couldn't determine: ${missing.join(", ")}` });
      return;
    }

    const notes = [
      conditionNote,
      fee ? `$${fee.toLocaleString()} broker fee — confirm whether it's included above.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    parsed.push({
      year: year!,
      make: make!,
      model: model!,
      trim,
      msrp: msrp!,
      payment: payment!,
      term: term!,
      milesPerYear,
      dueAtSigning: dueAtSigning!,
      exterior,
      interior,
      state,
      notes,
    });
  });

  return { parsed, skipped };
}
