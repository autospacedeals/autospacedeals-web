// How a visitor found the site — for the admin Leads page (/admin/leads,
// supabase/migrations/0033_lead_tracking.sql). Used by the browser
// (components/VisitTracker.tsx works it out from the URL and referrer and
// keeps it in a first-party cookie) and by the server (which reads that
// cookie when a shopper signs up or messages a seller). No third-party
// analytics: nothing leaves Drive.
//
// Ads should carry utm_source / utm_campaign on their links (e.g.
// ?utm_source=instagram-ads&utm_campaign=x5-oct); without them, an ad
// click id or the referring site is used instead.

export const SOURCE_COOKIE = "drive_src";
export const VISITOR_COOKIE = "drive_vid";
// Last non-direct source wins for this long.
export const SOURCE_MAX_AGE = 30 * 24 * 60 * 60;
export const VISITOR_MAX_AGE = 365 * 24 * 60 * 60;

export interface VisitSource {
  source: string;
  campaign: string | null;
}

export function cleanSource(raw: string | null | undefined): string | null {
  const s = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || null;
}

export function cleanCampaign(raw: string | null | undefined): string | null {
  const c = (raw ?? "").replace(/[\u0000-\u001f|]+/g, " ").trim().slice(0, 120);
  return c || null;
}

// Well-known referring sites, by host suffix.
const REFERRERS: [RegExp, string][] = [
  [/(^|\.)google\./, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)yahoo\.com$/, "yahoo"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)leasehackr\.com$/, "leasehackr"],
];

function referrerSource(referrer: string, ownHost: string): string | null {
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const own = ownHost.toLowerCase().replace(/^www\./, "");
  if (!host || host === own || host.endsWith("idriveus.com") || host === "localhost") return null;
  for (const [re, name] of REFERRERS) if (re.test(host)) return name;
  return cleanSource(host);
}

// The source this page view brings, or null when it brings none (an
// internal click, or a direct visit — the caller only records "direct"
// when nothing better is known).
export function sourceFromLanding(search: string, referrer: string, ownHost: string): VisitSource | null {
  const p = new URLSearchParams(search);
  const utm = cleanSource(p.get("utm_source"));
  const campaign = cleanCampaign(p.get("utm_campaign"));
  if (utm) return { source: utm, campaign };
  const ref = referrer ? referrerSource(referrer, ownHost) : null;
  // Ad click ids, for ads whose links weren't tagged.
  if (p.get("gclid") || p.get("gbraid") || p.get("wbraid")) return { source: "google-ads", campaign };
  if (p.get("ttclid")) return { source: "tiktok-ads", campaign };
  if (p.get("msclkid")) return { source: "bing-ads", campaign };
  // Facebook and Instagram add fbclid to every outbound link, ads or not.
  if (p.get("fbclid")) return { source: ref ?? "facebook", campaign };
  return ref ? { source: ref, campaign } : null;
}

export function encodeSource(s: VisitSource): string {
  return encodeURIComponent(`${s.source}|${s.campaign ?? ""}`);
}

export function decodeSource(raw: string | null | undefined): VisitSource | null {
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const [s, ...rest] = value.split("|");
  const source = cleanSource(s);
  return source ? { source, campaign: cleanCampaign(rest.join("|")) } : null;
}

export function isValidVisitorId(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9-]{8,64}$/.test(raw);
}
