// The numbers behind the admin Traction page (/admin/traction): month by
// month, how many people know Drive (visitors, returning visitors, how they
// found it) and use it (sign-ups, conversations, closed deals), plus supply.
// Counted in the database (0045 admin_traction_metrics). SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";

export interface TractionMonth {
  month: string; // "2026-10"
  visitors: number;
  newVisitors: number;
  returningVisitors: number;
  listingViews: number;
  signups: number;
  conversations: number;
  messages: number;
  sold: number;
  savedDeals: number;
  savedSearches: number;
  sellersNew: number;
  sellersTotal: number;
  listingsAdded: number;
}

export interface TractionNow {
  liveListings: number;
  liveSellers: number;
  makes: number;
  shoppers: number;
  visitorsAllTime: number;
}

// How a visitor found Drive, grouped for the page.
export const CHANNELS = [
  { key: "direct", label: "Direct", hint: "Typed idriveus.com, a bookmark, or someone told them" },
  { key: "search", label: "Search", hint: "Google, Bing and other search engines (not ads)" },
  { key: "ai", label: "AI assistants", hint: "ChatGPT, Perplexity, Claude, Gemini" },
  { key: "social", label: "Social", hint: "Instagram, Facebook, TikTok, Reddit, X, YouTube" },
  { key: "ads", label: "Ads", hint: "Paid ads (tagged links)" },
  { key: "offline", label: "Offline", hint: "Business cards, bus ads, flyers, QR codes" },
  { key: "referral", label: "Other sites", hint: "Leasehackr and other websites linking to Drive" },
  { key: "other", label: "Tests", hint: "Our own test links" },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]["key"];

export function channelOf(source: string): ChannelKey {
  const s = source.toLowerCase();
  if (s === "direct" || s === "autospacedeals.com") return "direct";
  if (/^(test|claude-)/.test(s)) return "other";
  if (/(^|-)ads?($|-)|paid|cpc|ppc/.test(s)) return "ads";
  if (/^(google|bing|duckduckgo|yahoo|brave|ecosia|search)/.test(s)) return "search";
  if (/chatgpt|openai|perplexity|claude\.ai|gemini|copilot/.test(s)) return "ai";
  if (/^(ig|instagram|facebook|fb|x|twitter|reddit|tiktok|youtube|linkedin|threads|snapchat|nextdoor)/.test(s)) return "social";
  if (/card|bus|shelter|flyer|qr|print|poster|billboard/.test(s)) return "offline";
  return "referral";
}

export interface Traction {
  months: TractionMonth[];
  channels: Record<string, Record<ChannelKey, number>>; // by month
  topSources: Record<string, { source: string; visitors: number }[]>; // by month
  now: TractionNow;
}

export async function getTraction(): Promise<Traction | null> {
  const { data, error } = await createAdminClient().rpc("admin_traction_metrics");
  if (error || !data) {
    console.error("admin_traction_metrics failed:", error?.message);
    return null;
  }
  const raw = data as {
    months: TractionMonth[];
    sources: { month: string; source: string; visitors: number }[];
    now: TractionNow;
  };
  const channels: Traction["channels"] = {};
  const topSources: Traction["topSources"] = {};
  for (const row of raw.sources) {
    const byChannel = (channels[row.month] ??= Object.fromEntries(CHANNELS.map((c) => [c.key, 0])) as Record<ChannelKey, number>);
    byChannel[channelOf(row.source)] += row.visitors;
    (topSources[row.month] ??= []).push({ source: row.source, visitors: row.visitors });
  }
  for (const list of Object.values(topSources)) list.sort((a, b) => b.visitors - a.visitors);
  // Start at the first month with anything in it (old test accounts go back further).
  const first = raw.months.findIndex((m) => Object.entries(m).some(([k, v]) => k !== "month" && typeof v === "number" && v > 0));
  const months = first > 0 ? raw.months.slice(first) : raw.months;
  return { months, channels, topSources, now: raw.now };
}
