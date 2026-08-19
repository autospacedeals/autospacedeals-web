// Shared helpers for reading a broker's public Google Sheet — used both for
// the one-off "link a Google Sheet" submission and the recurring sync job
// (lib/sheet-sync.ts) that re-checks it periodically.

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

    return { ok: true, csvText };
  } catch (err) {
    console.error("Failed to fetch Google Sheet:", err);
    return {
      ok: false,
      error: "Couldn't read that Google Sheet — double-check the link and sharing settings, or add cars manually below.",
    };
  }
}
