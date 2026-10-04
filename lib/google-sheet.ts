// Shared helpers for reading a broker's Google Sheet — used both for the
// one-off "link a Google Sheet" submission and the recurring sync job
// (lib/sheet-sync.ts) that re-checks it periodically. A sheet shared as
// "Anyone with the link" is read through its public export; a private one
// the broker has shared with Drive's service account (see
// lib/google-service-account.ts) is read through the Drive API instead.
//
// The sheet is downloaded once as .xlsx, which carries every tab (the CSV
// export only has the first) plus the formatting needed to spot crossed-out
// rows. Hidden tabs are skipped — brokers hide tabs they're not using.

import * as XLSX from "xlsx";
import { serviceAccountEmail, serviceAccountToken } from "@/lib/google-service-account";

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

export type FetchSheetResult = { ok: true; tabs: SheetTab[] } | { ok: false; error: string };

// How to share a sheet so we can read it, for the error messages.
function sharingHelp(): string {
  const email = serviceAccountEmail();
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

// A sheet that isn't public: download it as Drive's service account, which
// only sees files that were shared with it. `publicStatus` is the public
// export's HTTP error, if it gave one rather than a sign-in page.
async function fetchPrivateSheet(
  sheetId: string,
  publicStatus: number | null
): Promise<Buffer | { ok: false; error: string }> {
  const token = await serviceAccountToken();
  if (!token) {
    return {
      ok: false,
      error: publicStatus
        ? `Couldn't open that Google Sheet (error ${publicStatus}). ${sharingHelp()}`
        : `That Google Sheet isn't shared with us yet. ${sharingHelp()}`,
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
      error:
        res.status === 403 || res.status === 404
          ? `That Google Sheet isn't shared with us yet. ${sharingHelp()}`
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
    // raw: false gives each cell as displayed ("$599", "36/10k"), like the
    // CSV export did.
    const rows = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      .filter((row) => !skip?.has(rowNumber(row)));
    tabs.push({ name, rows });
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
