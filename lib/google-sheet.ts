// Shared helpers for reading a broker's public Google Sheet — used both for
// the one-off "link a Google Sheet" submission and the recurring sync job
// (lib/sheet-sync.ts) that re-checks it periodically.

import * as XLSX from "xlsx";

export function extractGoogleSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export type FetchSheetResult = { ok: true; csvText: string } | { ok: false; error: string };

// Fetches the CSV export of a Google Sheet's first tab. Requires the sheet
// to be shared as "Anyone with the link can view" — a private sheet's
// export URL redirects to a Google sign-in / "request access" HTML page
// instead of CSV, which we detect and report rather than trying (and
// failing) to parse it as data.
export async function fetchGoogleSheetCsv(sheetUrl: string): Promise<FetchSheetResult> {
  const sheetId = extractGoogleSheetId(sheetUrl);
  if (!sheetId) {
    return {
      ok: false,
      error:
        "That doesn't look like a Google Sheets link — copy the URL from your browser's address bar while viewing the sheet.",
    };
  }

  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`, {
      // Google's export endpoint sometimes behaves differently (or blocks)
      // requests without a browser-like User-Agent.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DriveBot/1.0)" },
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `Couldn't open that Google Sheet (error ${res.status}). Make sure sharing is set to "Anyone with the link can view" and try again.`,
      };
    }

    const csvText = await res.text();
    const looksLikeHtml = /^\s*<(!doctype|html)/i.test(csvText);
    if (looksLikeHtml) {
      return {
        ok: false,
        error:
          'That Google Sheet isn\'t publicly viewable yet. In Google Sheets, click "Share" → set to "Anyone with the link" → Viewer, then try again.',
      };
    }

    // Brokers often cross out a sold car instead of deleting its row. The CSV
    // export drops all formatting, so read the strikethrough from the xlsx
    // export and leave those rows out. Best-effort: if that read fails, fall
    // back to the plain CSV rather than failing the whole import.
    const struckRows = await fetchStruckRows(sheetId);
    return { ok: true, csvText: struckRows.size ? dropCsvRecords(csvText, struckRows) : csvText };
  } catch (err) {
    console.error("Failed to fetch Google Sheet:", err);
    return {
      ok: false,
      error: "Couldn't read that Google Sheet — double-check the link and sharing settings, or add cars manually below.",
    };
  }
}

// ---------------------------------------------------------------------------
// Crossed-out rows
// ---------------------------------------------------------------------------

// Sheet row number (1-based) → the text of that row's first filled cell,
// for every row where most of the filled cells are struck through.
async function fetchStruckRows(sheetId: string): Promise<Map<number, string>> {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DriveBot/1.0)" },
    });
    if (!res.ok) return new Map();
    return findStruckRows(Buffer.from(await res.arrayBuffer()));
  } catch (err) {
    console.error("Couldn't read sheet formatting (crossed-out rows will be kept):", err);
    return new Map();
  }
}

// Reads strikethrough straight from the xlsx XML — the xlsx package's
// community build doesn't expose font styles. Looks at the first tab only,
// same as the CSV export.
export function findStruckRows(xlsx: Buffer): Map<number, string> {
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

  // First tab = first <sheet> in workbook.xml, resolved through its rels.
  const rId = (file("xl/workbook.xml") ?? "").match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const target = rId
    ? (file("xl/_rels/workbook.xml.rels") ?? "").match(new RegExp(`<Relationship\\b[^>]*Id="${rId}"[^>]*Target="([^"]+)"`))?.[1] ??
      (file("xl/_rels/workbook.xml.rels") ?? "").match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rId}"`))?.[1]
    : undefined;
  const sheet = file(`xl/${(target ?? "worksheets/sheet1.xml").replace(/^\/?xl\//, "")}`) ?? "";

  const result = new Map<number, string>();
  for (const row of sheet.match(/<row\b[\s\S]*?(?:<\/row>|\/>)/g) ?? []) {
    const rowNum = Number(row.match(/<row\b[^>]*\br="(\d+)"/)?.[1]);
    if (!rowNum) continue;
    let filled = 0;
    let struck = 0;
    let firstText = "";
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
      if (!firstText) firstText = cell.text.trim();
    }
    // Most of the row, not just one cell — a single crossed-out old price
    // next to a new one shouldn't take the car down.
    if (filled > 0 && struck * 2 > filled) result.set(rowNum, firstText);
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

// Removes the given sheet rows from Google's CSV export. CSV record N is
// sheet row N (the export keeps empty rows), but a quoted cell can span
// lines, so records are split quote-aware. Each drop is sanity-checked
// against the row's first cell text; if the numbering doesn't line up, it
// falls back to the first record that starts with that text.
export function dropCsvRecords(csv: string, struck: Map<number, string>): string {
  const records: string[] = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "\n" && !inQuotes) {
      records.push(csv.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < csv.length) records.push(csv.slice(start));

  // First non-empty field of a CSV record (quote-aware).
  const firstField = (record: string) => {
    const line = record.replace(/\r?\n$/, "");
    let field = "";
    let quoted = false;
    for (let i = 0; i <= line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          field += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else field += ch ?? "";
      } else if (ch === '"') quoted = true;
      else if (ch === "," || ch === undefined) {
        if (field.trim()) return field.trim();
        field = "";
      } else field += ch;
    }
    return "";
  };

  const drop = new Set<number>();
  for (const [rowNum, text] of struck) {
    const idx = rowNum - 1;
    if (idx < records.length && firstField(records[idx]).includes(text.slice(0, 40))) {
      drop.add(idx);
      continue;
    }
    const fallback = records.findIndex((r, i) => !drop.has(i) && firstField(r).includes(text.slice(0, 40)));
    if (fallback >= 0) drop.add(fallback);
  }
  return records.filter((_, i) => !drop.has(i)).join("");
}
