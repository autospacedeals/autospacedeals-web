// Shared helpers for reading a broker's Google Sheet — used both for the
// one-off "link a Google Sheet" submission and the recurring sync job
// (lib/sheet-sync.ts) that re-checks it periodically. A sheet shared as
// "Anyone with the link" is read through its public export; a private one
// the broker has shared with Drive's service account (see
// lib/google-service-account.ts) is read through the Drive API instead.
//
// With the service account configured, a sheet is read through the Google
// Sheets API: every tab's cells as displayed, plus strikethrough to spot
// crossed-out rows. That works for any sheet shared with the service
// account (or "anyone with the link") — even when the owner turned off
// downloads for viewers, which blocks the export. Without it (local dev), a
// public sheet is downloaded once as .xlsx instead. Hidden tabs are skipped
// either way — brokers hide tabs they're not using.
//
// Rows are keyed by the tab's header row, which isn't always row 1: a logo
// or banner often sits above it, so the first row that reads like column
// headings (Model, Payment, Term, …) is used.

import * as XLSX from "xlsx";
import { serviceAccountEmail, serviceAccountToken } from "@/lib/google-service-account";
import { readerAccessToken, shareEmail } from "@/lib/google-reader";

export function extractGoogleSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// One visible tab: its name and its rows, keyed by the header row, with
// crossed-out rows already left out. Rows keep SheetJS's non-enumerable
// __rowNum__ (0-based sheet row).
export interface SheetTab {
  name: string;
  rows: Record<string, unknown>[];
}

// notShared: the sheet is private and hasn't been shared with Drive's
// reader yet — the dashboard then offers "Connect with Google".
export type FetchSheetResult = { ok: true; tabs: SheetTab[] } | { ok: false; error: string; notShared?: boolean };

// How to share a sheet so we can read it, for the error messages.
async function sharingHelp(): Promise<string> {
  const email = await shareEmail(serviceAccountEmail());
  return email
    ? `In Google Sheets, click "Share" and either add ${email} as a Viewer or set it to "Anyone with the link" → Viewer, then try again.`
    : 'In Google Sheets, click "Share" → set to "Anyone with the link" → Viewer, then try again.';
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
}

// Downloads the sheet (every tab) and reads it. A private sheet's public
// export answers with a Google sign-in / "request access" HTML page instead
// of a file, which we detect — then try the service account, and report how
// to share it if that can't read it either.
export async function fetchGoogleSheetTabs(sheetUrl: string): Promise<FetchSheetResult> {
  const sheetId = extractGoogleSheetId(sheetUrl);
  if (!sheetId) {
    return {
      ok: false,
      error:
        "That doesn't look like a Google Sheets link — copy the URL from your browser's address bar while viewing the sheet.",
    };
  }

  try {
    // Shared with sheets@idriveus.com (the friendly address brokers are
    // shown) or with the service account — try each reader.
    for (const getToken of [readerAccessToken, serviceAccountToken]) {
      const token = await getToken();
      if (!token) continue;
      const viaApi = await fetchViaSheetsApi(sheetId, token);
      if (viaApi.ok) return viaApi;
      if (viaApi.status !== 403 && viaApi.status !== 404) return { ok: false, error: viaApi.error };
    }
    // Not shared with either: fall back to the public export (a link-shared
    // sheet), and report sharing help if that fails too.

    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, {
      // Google's export endpoint sometimes behaves differently (or blocks)
      // requests without a browser-like User-Agent.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DriveBot/1.0)" },
      cache: "no-store",
    });
    const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    const file = buf && isZip(buf) ? buf : await fetchPrivateSheet(sheetId, res.ok ? null : res.status);
    if (!Buffer.isBuffer(file)) return file;
    return { ok: true, tabs: readWorkbookTabs(file) };
  } catch (err) {
    console.error("Failed to fetch Google Sheet:", err);
    return {
      ok: false,
      error: "Couldn't read that Google Sheet — double-check the link and sharing settings, or add cars manually below.",
    };
  }
}

// ---------------------------------------------------------------------------
// Google Sheets API
// ---------------------------------------------------------------------------

interface ApiCell {
  formattedValue?: string;
  effectiveFormat?: { textFormat?: { strikethrough?: boolean } };
  textFormatRuns?: { startIndex?: number; format?: { strikethrough?: boolean } }[];
}
interface ApiSheet {
  properties?: { title?: string; hidden?: boolean; sheetType?: string };
  data?: { startRow?: number; rowData?: { values?: ApiCell[] }[] }[];
}

const SHEETS_FIELDS =
  "sheets(properties(title,hidden,sheetType)," +
  "data(startRow,rowData(values(formattedValue,effectiveFormat(textFormat(strikethrough)),textFormatRuns(startIndex,format(strikethrough))))))";

async function fetchViaSheetsApi(
  sheetId: string,
  token: string
): Promise<{ ok: true; tabs: SheetTab[] } | { ok: false; status: number; error: string }> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}?includeGridData=true&fields=${encodeURIComponent(SHEETS_FIELDS)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(60_000) }
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status !== 403 && res.status !== 404) console.error("Sheets API read failed:", res.status, detail);
    return {
      ok: false,
      status: res.status,
      error: `Couldn't open that Google Sheet (error ${res.status}). Try again in a minute, or add cars manually below.`,
    };
  }
  const body = (await res.json()) as { sheets?: ApiSheet[] };
  const tabs: SheetTab[] = [];
  for (const sheet of body.sheets ?? []) {
    const name = sheet.properties?.title;
    if (!name || sheet.properties?.hidden) continue;
    if (sheet.properties?.sheetType && sheet.properties.sheetType !== "GRID") continue;
    const grid: GridRow[] = [];
    for (const block of sheet.data ?? []) {
      (block.rowData ?? []).forEach((row, i) => {
        const values = row.values ?? [];
        const cells = values.map((c) => (c.formattedValue ?? "").trim());
        if (!cells.some(Boolean)) return;
        // Crossed out: most of the filled cells are struck through (a single
        // crossed-out old price next to a new one doesn't count).
        let filled = 0;
        let struck = 0;
        values.forEach((c, j) => {
          if (!cells[j]) return;
          filled++;
          const runs = c.textFormatRuns;
          const cellStruck = c.effectiveFormat?.textFormat?.strikethrough === true;
          const allRunsStruck =
            runs && runs.length > 0 ? runs.every((r) => r.format?.strikethrough ?? cellStruck) : cellStruck;
          if (allRunsStruck) struck++;
        });
        if (struck * 2 > filled) return;
        grid.push({ rowNum: (block.startRow ?? 0) + i + 1, cells });
      });
    }
    tabs.push({ name, rows: rowsFromGrid(grid) });
  }
  return { ok: true, tabs };
}

// ---------------------------------------------------------------------------
// Header row
// ---------------------------------------------------------------------------

interface GridRow {
  rowNum: number; // 1-based sheet row
  cells: string[];
}

const HEADER_WORD =
  /^(model|vehicle|car|year|make|trim|payment|monthly|price|term|lease|msrp|due|das|drive.?off|miles?|mileage|spec|color|exterior|interior|location|fees?|broker fee|notes?|incentives?)\b/i;

// Turns a tab's non-empty rows into objects keyed by its header row: the
// first row (within the top 40) with at least two cells that read like
// column headings, else the first row. Rows above the header (titles,
// banners) are kept — they can carry notes that apply to the cars. Each row
// keeps its sheet row as SheetJS's non-enumerable __rowNum__ (0-based).
export function rowsFromGrid(grid: GridRow[]): Record<string, unknown>[] {
  if (grid.length === 0) return [];
  const headerIdx = Math.max(
    0,
    grid.slice(0, 40).findIndex((r) => r.cells.filter((c) => c.length < 40 && HEADER_WORD.test(c)).length >= 2)
  );
  const width = Math.max(...grid.map((r) => r.cells.length));
  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, j) => {
    const base = grid[headerIdx].cells[j]?.trim() || `Column ${j + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} ${n}` : base;
  });
  return grid
    .filter((_, i) => i !== headerIdx)
    .map((r) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, j) => (obj[h] = r.cells[j] ?? ""));
      Object.defineProperty(obj, "__rowNum__", { value: r.rowNum - 1, enumerable: false });
      return obj;
    });
}

// ---------------------------------------------------------------------------
// .xlsx download (public sheets without the service account, and uploads)
// ---------------------------------------------------------------------------

// A sheet that isn't public: download it as Drive's service account, which
// only sees files that were shared with it. `publicStatus` is the public
// export's HTTP error, if it gave one rather than a sign-in page.
async function fetchPrivateSheet(
  sheetId: string,
  publicStatus: number | null
): Promise<Buffer | { ok: false; error: string; notShared?: boolean }> {
  const token = await serviceAccountToken();
  if (!token) {
    return {
      ok: false,
      notShared: true,
      error: publicStatus
        ? `Couldn't open that Google Sheet (error ${publicStatus}). ${await sharingHelp()}`
        : `That Google Sheet isn't shared with us yet. ${await sharingHelp()}`,
    };
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!res.ok) {
    if (res.status !== 403 && res.status !== 404) {
      console.error("Drive export of a private sheet failed:", res.status, (await res.text()).slice(0, 300));
    }
    return {
      ok: false,
      notShared: res.status === 403 || res.status === 404,
      error:
        res.status === 403 || res.status === 404
          ? `That Google Sheet isn't shared with us yet. ${await sharingHelp()}`
          : `Couldn't open that Google Sheet (error ${res.status}). Try again in a minute, or add cars manually below.`,
    };
  }
  return Buffer.from(await res.arrayBuffer());
}

// Every visible tab of a workbook (.xlsx/.xls/.csv), crossed-out rows
// removed. Also used for uploaded Excel files.
export function readWorkbookTabs(file: Buffer | ArrayBuffer): SheetTab[] {
  const buf = Buffer.isBuffer(file) ? file : Buffer.from(file);
  const workbook = XLSX.read(buf, { type: "buffer" });
  // Best-effort: if the formatting can't be read, keep every row rather
  // than failing the whole import.
  let struck = new Map<string, Set<number>>();
  if (isZip(buf)) {
    try {
      struck = findStruckRowsByTab(buf);
    } catch (err) {
      console.error("Couldn't read sheet formatting (crossed-out rows will be kept):", err);
    }
  }

  const tabs: SheetTab[] = [];
  workbook.SheetNames.forEach((name, i) => {
    if (workbook.Workbook?.Sheets?.[i]?.Hidden) return;
    const sheet = workbook.Sheets[name];
    if (!sheet) return;
    const skip = struck.get(name);
    // raw: false gives each cell as displayed ("$599", "36/10k").
    // Blank rows kept so each array's index maps back to its sheet row.
    const firstRow = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r : 0;
    const grid: GridRow[] = XLSX.utils
      .sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: true })
      .map((row, i) => ({ rowNum: firstRow + i + 1, cells: row.map((c) => String(c ?? "").trim()) }))
      .filter((r) => r.cells.some(Boolean) && !skip?.has(r.rowNum));
    tabs.push({ name, rows: rowsFromGrid(grid) });
  });
  return tabs;
}

// 1-based sheet row a sheet_to_json row came from.
export function rowNumber(row: Record<string, unknown>): number {
  return ((row as { __rowNum__?: number }).__rowNum__ ?? -1) + 1;
}

// ---------------------------------------------------------------------------
// Crossed-out rows
// ---------------------------------------------------------------------------

// Tab name → sheet row numbers (1-based) where most of the filled cells are
// struck through. Read straight from the xlsx XML — the xlsx package's
// community build doesn't expose font styles.
export function findStruckRowsByTab(xlsx: Buffer): Map<string, Set<number>> {
  const zip = XLSX.CFB.read(xlsx, { type: "buffer" });
  const file = (name: string): string | null => {
    const i = zip.FullPaths.findIndex((p: string) => p.toLowerCase().endsWith("/" + name.toLowerCase()));
    const content = i >= 0 ? zip.FileIndex[i]?.content : null;
    return content ? Buffer.from(content as Uint8Array).toString("utf8") : null;
  };

  const styles = file("xl/styles.xml") ?? "";
  const isStrike = (xml: string) => /<strike(?:\s+val="(?:1|true)")?\s*\/>/.test(xml);
  const fonts = (styles.match(/<fonts\b[\s\S]*?<\/fonts>/)?.[0] ?? "").match(/<font\b[\s\S]*?(?:<\/font>|\/>)/g) ?? [];
  const struckFont = fonts.map(isStrike);
  const xfs = (styles.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] ?? "").match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? [];
  const struckXf = xfs.map((xf) => struckFont[Number(xf.match(/\bfontId="(\d+)"/)?.[1] ?? -1)] === true);

  // Rich-text strings carry their own per-run fonts.
  const runs = (rich: string, cellStruck: boolean) => {
    const parts = rich.match(/<r>[\s\S]*?<\/r>/g);
    const text = decodeXml((rich.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));
    if (!parts) return { text, struck: cellStruck };
    const visible = parts.filter((r) => /<t\b[^>]*>[\s\S]*?\S[\s\S]*?<\/t>/.test(r));
    const struck =
      visible.length > 0 &&
      visible.every((r) => {
        const rPr = r.match(/<rPr>[\s\S]*?<\/rPr>/)?.[0];
        return rPr ? isStrike(rPr) : cellStruck;
      });
    return { text, struck };
  };
  const shared = (file("xl/sharedStrings.xml") ?? "").match(/<si>[\s\S]*?<\/si>/g) ?? [];

  // Each <sheet name=… r:id=…> in workbook.xml, resolved through its rels.
  const rels = file("xl/_rels/workbook.xml.rels") ?? "";
  const targetOf = (rId: string) =>
    rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rId}"[^>]*Target="([^"]+)"`))?.[1] ??
    rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rId}"`))?.[1];

  const result = new Map<string, Set<number>>();
  for (const tag of (file("xl/workbook.xml") ?? "").match(/<sheet\b[^>]*>/g) ?? []) {
    const name = decodeXml(tag.match(/\bname="([^"]*)"/)?.[1] ?? "");
    const rId = tag.match(/\br:id="([^"]+)"/)?.[1];
    const target = rId ? targetOf(rId) : undefined;
    if (!name || !target) continue;
    const sheet = file(`xl/${target.replace(/^\/?xl\//, "")}`) ?? "";

    const rowsStruck = new Set<number>();
    for (const row of sheet.match(/<row\b[\s\S]*?(?:<\/row>|\/>)/g) ?? []) {
      const rowNum = Number(row.match(/<row\b[^>]*\br="(\d+)"/)?.[1]);
      if (!rowNum) continue;
      let filled = 0;
      let struck = 0;
      for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) ?? []) {
        const cellStruck = struckXf[Number(c.match(/\bs="(\d+)"/)?.[1] ?? 0)] === true;
        const type = c.match(/\bt="([^"]+)"/)?.[1];
        let cell: { text: string; struck: boolean };
        if (type === "s") {
          cell = runs(shared[Number(c.match(/<v>(\d+)<\/v>/)?.[1] ?? -1)] ?? "", cellStruck);
        } else if (type === "inlineStr") {
          cell = runs(c.match(/<is>[\s\S]*?<\/is>/)?.[0] ?? "", cellStruck);
        } else {
          cell = { text: decodeXml(c.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ""), struck: cellStruck };
        }
        if (!cell.text.trim()) continue;
        filled++;
        if (cell.struck) struck++;
      }
      // Most of the row, not just one cell — a single crossed-out old price
      // next to a new one shouldn't take the car down.
      if (filled > 0 && struck * 2 > filled) rowsStruck.add(rowNum);
    }
    if (rowsStruck.size) result.set(name, rowsStruck);
  }
  return result;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
