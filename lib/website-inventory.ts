// Reading a seller's inventory from their own website (the "Your website"
// upload option). Many dealer/broker sites build their deals page from a
// data feed on the same site (e.g. /deals-api.php returning JSON); when the
// page points to one, its deals are read as rows — every field, exactly as
// the site stores them — through the same AI reader as spreadsheets
// (parseTabs). Otherwise the page's visible text is read like pasted text.
//
// The URL comes from the seller, so only public http(s) sites are fetched:
// private, loopback and link-local addresses are refused, redirects are
// re-checked, and responses are size- and time-limited.
// SERVER-ONLY.
import { lookup } from "dns/promises";
import { isIP } from "net";
import type { SheetTab } from "@/lib/google-sheet";

const FETCH_TIMEOUT_MS = 15000;
const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_FEED_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_FEED_CANDIDATES = 8;
const MAX_TEXT_CHARS = 60000;
const MAX_FIELD_CHARS = 400;
const USER_AGENT = "Mozilla/5.0 (compatible; DriveInventoryReader/1.0; +https://www.idriveus.com)";

export type WebsiteInventory =
  // photos[i] = the seller's own photos for tab.rows[i] (absolute or data: URLs).
  | { ok: true; kind: "feed"; feedUrl: string; tab: SheetTab; total: number; photos: string[][] }
  | { ok: true; kind: "text"; text: string }
  | { ok: false; error: string };

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https links work.");
  if (url.username || url.password) throw new Error("That link can't include a login.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("That address isn't public.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => privateAddress(a.address))) {
    throw new Error("That address isn't public.");
  }
}

// GET with the checks above on every redirect hop, a timeout and a size cap.
async function fetchPublicBytes(
  raw: string,
  maxBytes: number,
  accept = "text/html,application/json;q=0.9,*/*;q=0.8"
): Promise<{ url: URL; type: string; bytes: Buffer }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`The site answered with an error (${res.status}).`);
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new Error("That page is too large to read.");
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error("That page is too large to read.");
        }
        chunks.push(value);
      }
    }
    return { url, type: res.headers.get("content-type") ?? "", bytes: Buffer.concat(chunks) };
  }
  throw new Error("That link redirects too many times.");
}

async function fetchPublic(raw: string, maxBytes: number): Promise<{ url: URL; type: string; body: string }> {
  const { url, type, bytes } = await fetchPublicBytes(raw, maxBytes);
  return { url, type, body: new TextDecoder("utf-8").decode(bytes) };
}

// One of the seller's photos (same public-address checks; a data: URL is
// decoded instead), or null if it can't be fetched or isn't an image.
export async function fetchPublicImage(raw: string): Promise<Buffer | null> {
  const embedded = raw.match(/^data:image\/(?:jpeg|png|webp|gif);base64,([\s\S]+)$/i);
  if (embedded) {
    const bytes = Buffer.from(embedded[1], "base64");
    return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? bytes : null;
  }
  try {
    const { type, bytes } = await fetchPublicBytes(raw, MAX_IMAGE_BYTES, "image/*");
    return type.startsWith("image/") ? bytes : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Same-site addresses the page's scripts load data from: quoted paths that
// end in .json/.php or mention api/deals/inventory/vehicles. Ones that look
// most like data (.json, .php, "api") are tried first; bare words (CSS
// class names), template strings and page links are skipped.
function feedCandidates(html: string, page: URL): URL[] {
  const found = new Map<string, { url: URL; rank: number }>();
  for (const m of html.matchAll(/["'`]((?:https?:\/\/[^"'`\s]+)|(?:\/?[\w.\-/]+))["'`]/g)) {
    const raw = m[1];
    if (raw.includes("${") || !/[/.]/.test(raw)) continue;
    if (!/\.json(\?|$)|\.php(\?|$)|(^|[\/\-_])(api|deals|inventory|vehicles|specials)([/.?\-_]|$)/i.test(raw)) continue;
    if (/\.(js|mjs|css|html?|png|jpe?g|webp|gif|svg|ico|woff2?)(\?|$)/i.test(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw, page);
    } catch {
      continue;
    }
    if (url.host !== page.host || url.href.replace(/\/$/, "") === page.href.replace(/\/$/, "")) continue;
    const rank = /\.json(\?|$)|\.php(\?|$)|(^|[\/\-_])api([/.?\-_]|$)/i.test(url.pathname) ? 0 : 1;
    const prev = found.get(url.href);
    if (!prev || rank < prev.rank) found.set(url.href, { url, rank });
  }
  return [...found.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_FEED_CANDIDATES)
    .map((c) => c.url);
}

// The seller's own photos for one car, as absolute URLs on their site
// (or wherever they host them), best first.
function photosOf(o: Record<string, unknown>, base: URL): string[] {
  const urls: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string" && /^data:image\/(jpeg|png|webp|gif);base64,/i.test(v)) {
      // A photo embedded in the data itself rather than linked.
      if (v.length <= MAX_IMAGE_BYTES * 1.4 && !urls.includes(v)) urls.push(v);
    } else if (typeof v === "string" && v.trim()) {
      try {
        const u = new URL(v.trim(), base);
        if ((u.protocol === "https:" || u.protocol === "http:") && !urls.includes(u.href)) urls.push(u.href);
      } catch {
        // not a URL
      }
    } else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === "object") add((v as Record<string, unknown>).url ?? (v as Record<string, unknown>).src);
  };
  for (const [k, v] of Object.entries(o)) {
    if (/^(photo|image|img|thumbnail|thumb|mainphoto|mainimage)$/i.test(k)) add(v);
  }
  for (const [k, v] of Object.entries(o)) {
    if (/^(photos|images|gallery|pictures)$/i.test(k)) add(v);
  }
  return urls.slice(0, 8);
}

const looksLikeCar = (o: unknown) =>
  !!o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).some((k) => /^(make|brand)$/i.test(k)) &&
  Object.keys(o).some((k) => /^model/i.test(k));

// The biggest list of car-like objects anywhere in the JSON (a few levels deep).
function findCarList(value: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 4 || !value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    const cars = value.filter(looksLikeCar);
    if (cars.length >= 1 && cars.length >= value.length / 2) return cars as Record<string, unknown>[];
    return null;
  }
  let best: Record<string, unknown>[] | null = null;
  for (const v of Object.values(value)) {
    const list = findCarList(v, depth + 1);
    if (list && (!best || list.length > best.length)) best = list;
  }
  return best;
}

// Fields that say nothing about the deal (ids, photos, staff contact info,
// display order) are left out, HTML is turned into text, long text is cut.
const SKIP_FIELD = /^(_?id|uuid|slug|photos?|images?|img|thumb(nail)?s?|gallery|sort(order)?|order|position|internal|hidden|created(_?at)?|updated(_?at)?|broker(id|name|phone|email)|(sales)?(email|phone)|agent.*|url|link)$/i;

function toRow(o: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (SKIP_FIELD.test(k) || v == null || v === "") continue;
    if (typeof v === "object") {
      const flat = JSON.stringify(v);
      if (flat && flat !== "[]" && flat !== "{}") row[k] = flat.slice(0, MAX_FIELD_CHARS);
      continue;
    }
    const s = typeof v === "string" && /<[a-z][\s\S]*>/i.test(v) ? htmlToText(v) : String(v);
    if (s.trim()) row[k] = s.trim().replace(/\s+/g, " ").slice(0, MAX_FIELD_CHARS);
  }
  return row;
}

// Every row gets the same columns (the reader takes the column list from a
// batch's first row), in first-seen order.
function sameColumns(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? ""])));
}

// Told to the AI with every batch of a feed.
export const FEED_CONTEXT =
  "These rows are the deals list from the seller's own website (its data feed), one car per row, with the " +
  "site's own field names. A field that's 0, false or empty isn't used. If a lease has no separate non-zero " +
  "due-at-signing field, its down payment / drive-off / cash-due field is its due at signing. A payment field " +
  "with MSD in its name is the lower monthly payment WITH multiple security deposits (msdPayment), and an MSD " +
  "amount field is the per-deposit amount (total = count x amount).";

const isHidden = (o: Record<string, unknown>) =>
  o.hidden === true || o.hidden === 1 || o.hidden === "1" || o.active === false || o.published === false;

export async function readWebsiteInventory(rawUrl: string): Promise<WebsiteInventory> {
  let page: { url: URL; type: string; body: string };
  try {
    page = await fetchPublic(rawUrl, MAX_PAGE_BYTES);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return { ok: false, error: message.includes("timeout") || message.includes("aborted") ? "That site took too long to answer." : message || "Couldn't open that link." };
  }

  // A link straight to a JSON feed.
  if (/json/i.test(page.type)) {
    try {
      const list = findCarList(JSON.parse(page.body));
      if (list?.length) {
        const visible = list.filter((o) => !isHidden(o));
        return {
          ok: true,
          kind: "feed",
          feedUrl: page.url.href,
          total: list.length,
          tab: { name: "Website", rows: sameColumns(visible.map(toRow)) },
          photos: visible.map((o) => photosOf(o, page.url)),
        };
      }
    } catch {
      // not usable JSON; fall through
    }
  }

  // A data feed the page loads its deals from.
  for (const candidate of feedCandidates(page.body, page.url)) {
    try {
      const feed = await fetchPublic(candidate.href, MAX_FEED_BYTES);
      const list = findCarList(JSON.parse(feed.body));
      if (list && list.length > 0) {
        const visible = list.filter((o) => !isHidden(o));
        if (visible.length === 0) continue;
        return {
          ok: true,
          kind: "feed",
          feedUrl: feed.url.href,
          total: list.length,
          tab: { name: "Website", rows: sameColumns(visible.map(toRow)) },
          // Relative photo paths are on the page's site.
          photos: visible.map((o) => photosOf(o, page.url)),
        };
      }
    } catch {
      // not a feed; try the next
    }
  }

  const text = htmlToText(page.body).slice(0, MAX_TEXT_CHARS);
  if (text.length < 40) return { ok: false, error: "That page didn't have any readable text." };
  return { ok: true, kind: "text", text };
}

// A page with no feed: its text, read in chunks so a long deals page fits
// (one AI call per ~10,000 characters, split at line breaks).
export function textChunks(text: string, size = 10000): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > size && current) {
      chunks.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line.slice(0, size);
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}
