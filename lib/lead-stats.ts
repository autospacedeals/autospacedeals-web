// The numbers behind the admin Leads page (/admin/leads): visits, listing
// views, sign-ups, conversations, broker reply times and sales, by source
// and by broker. SERVER-ONLY (service role).
import { createAdminClient } from "@/lib/supabase/server";
import { participantNames } from "@/lib/messages";

const HOUR = 60 * 60 * 1000;
const ROW_LIMIT = 50000;

interface VisitRow {
  visitor: string;
  kind: "landing" | "listing";
  deal_id: string | null;
  broker_id: string | null;
  source: string | null;
  campaign: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

interface LeadRow {
  id: string;
  customer_id: string;
  broker_id: string;
  deal_id: string | null;
  deal_label: string;
  created_at: string;
  first_broker_reply_at: string | null;
  last_sender_role: string | null;
  last_message_at: string;
  source: string | null;
  campaign: string | null;
  outcome: string | null;
}

export interface SourceStats {
  key: string;
  visitors: number;
  listingViews: number;
  signups: number;
  conversations: number;
  sold: number;
}

export interface LocationStats {
  key: string;
  visitors: number;
  listingViews: number;
}

export interface BrokerStats {
  id: string;
  name: string;
  listingViews: number;
  conversations: number;
  replied: number;
  within1h: number;
  medianReplyMs: number | null;
  waiting: number;
  sold: number;
  working: number;
  lost: number;
  unmarked: number;
}

export interface LeadItem {
  id: string;
  createdAt: string;
  shopper: string;
  broker: string;
  car: string;
  source: string;
  replyMs: number | null;
  waiting: boolean;
  outcome: string | null;
}

export interface LeadStats {
  totals: {
    visitors: number;
    listingViews: number;
    signups: number;
    conversations: number;
    replied: number;
    sold: number;
  };
  sources: SourceStats[];
  states: LocationStats[];
  cities: LocationStats[];
  brokers: BrokerStats[];
  topListings: { dealId: string; title: string; views: number; conversations: number }[];
  recent: LeadItem[];
  ready: boolean;
}

function sourceKey(source: string | null, campaign: string | null): string {
  if (!source) return "unknown";
  return campaign ? `${source} · ${campaign}` : source;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Visitors (distinct, from their landings) and listing views per place.
function byLocation(visits: VisitRow[], keyOf: (v: VisitRow) => string | null): LocationStats[] {
  const map = new Map<string, { visitors: Set<string>; listingViews: number }>();
  for (const v of visits) {
    const key = keyOf(v) ?? "Unknown";
    const row = map.get(key) ?? { visitors: new Set<string>(), listingViews: 0 };
    if (v.kind === "landing") row.visitors.add(v.visitor);
    else row.listingViews++;
    map.set(key, row);
  }
  return [...map.entries()]
    .map(([key, r]) => ({ key, visitors: r.visitors.size, listingViews: r.listingViews }))
    .sort((a, b) => b.visitors - a.visitors || b.listingViews - a.listingViews);
}

// Still waiting on the broker: the shopper spoke last over an hour ago.
function isWaiting(l: LeadRow, now: number): boolean {
  return l.last_sender_role === "customer" && now - new Date(l.last_message_at).getTime() > HOUR;
}

// The last `days` days, or everything when null.
export async function getLeadStats(days: number | null): Promise<LeadStats> {
  const admin = createAdminClient();
  const sinceIso = days ? new Date(Date.now() - days * 24 * HOUR).toISOString() : null;
  const since = <T extends { gte: (col: string, v: string) => T }>(q: T) => (sinceIso ? q.gte("created_at", sinceIso) : q);

  const [visits, signups, convs, brokersRes] = await Promise.all([
    since(admin.from("site_visits").select("visitor, kind, deal_id, broker_id, source, campaign, country, region, city"))
      .limit(ROW_LIMIT)
      .returns<VisitRow[]>(),
    since(admin.from("customers").select("id, signup_source, signup_campaign"))
      .limit(ROW_LIMIT)
      .returns<{ id: string; signup_source: string | null; signup_campaign: string | null }[]>(),
    since(
      admin
        .from("conversations")
        .select(
          "id, customer_id, broker_id, deal_id, deal_label, created_at, first_broker_reply_at, last_sender_role, " +
            "last_message_at, source, campaign, outcome"
        )
    )
      .order("created_at", { ascending: false })
      .limit(ROW_LIMIT)
      .returns<LeadRow[]>(),
    admin.from("brokers").select("id, business_name").returns<{ id: string; business_name: string | null }[]>(),
  ]);
  const ready = !visits.error && !convs.error && !signups.error;
  for (const r of [visits, signups, convs, brokersRes]) if (r.error) console.error("getLeadStats:", r.error.message);

  const visitRows = visits.data ?? [];
  const leadRows = convs.data ?? [];
  const now = Date.now();

  // By source
  const bySource = new Map<string, SourceStats & { visitorSet: Set<string> }>();
  const sourceRow = (key: string) => {
    let s = bySource.get(key);
    if (!s) {
      s = { key, visitors: 0, listingViews: 0, signups: 0, conversations: 0, sold: 0, visitorSet: new Set() };
      bySource.set(key, s);
    }
    return s;
  };
  const allVisitors = new Set<string>();
  for (const v of visitRows) {
    const s = sourceRow(sourceKey(v.source, v.campaign));
    if (v.kind === "landing") {
      s.visitorSet.add(v.visitor);
      allVisitors.add(v.visitor);
    } else s.listingViews++;
  }
  for (const c of signups.data ?? []) sourceRow(sourceKey(c.signup_source, c.signup_campaign)).signups++;
  for (const l of leadRows) {
    const s = sourceRow(sourceKey(l.source, l.campaign));
    s.conversations++;
    if (l.outcome === "sold") s.sold++;
  }
  const sources = [...bySource.values()]
    .map(({ visitorSet, ...s }) => ({ ...s, visitors: visitorSet.size }))
    .sort((a, b) => b.visitors - a.visitors || b.conversations - a.conversations);

  // By location (Vercel's IP lookup: approximate, and missing for some visits).
  // US visits by state; other countries by full name ("IN" -> "India").
  const states = byLocation(visitRows, (v) =>
    !v.country ? null : v.country === "US" ? (v.region ? `${v.region}` : "US (state unknown)") : countryName(v.country)
  );
  const cities = byLocation(visitRows, (v) => {
    if (!v.city) return null;
    return v.country === "US"
      ? `${v.city}, ${v.region ?? "US"}`
      : `${v.city}, ${v.country ? countryName(v.country) : ""}`.replace(/, $/, "");
  });

  // By broker
  const brokerNames = new Map((brokersRes.data ?? []).map((b) => [b.id, b.business_name || "Unnamed broker"]));
  const byBroker = new Map<string, BrokerStats & { replyTimes: number[] }>();
  const brokerRow = (id: string) => {
    let b = byBroker.get(id);
    if (!b) {
      b = {
        id,
        name: brokerNames.get(id) ?? "Unknown broker",
        listingViews: 0,
        conversations: 0,
        replied: 0,
        within1h: 0,
        medianReplyMs: null,
        waiting: 0,
        sold: 0,
        working: 0,
        lost: 0,
        unmarked: 0,
        replyTimes: [],
      };
      byBroker.set(id, b);
    }
    return b;
  };
  for (const v of visitRows) if (v.kind === "listing" && v.broker_id) brokerRow(v.broker_id).listingViews++;
  for (const l of leadRows) {
    const b = brokerRow(l.broker_id);
    b.conversations++;
    if (l.first_broker_reply_at) {
      const ms = new Date(l.first_broker_reply_at).getTime() - new Date(l.created_at).getTime();
      b.replied++;
      b.replyTimes.push(Math.max(0, ms));
      if (ms <= HOUR) b.within1h++;
    }
    if (isWaiting(l, now)) b.waiting++;
    if (l.outcome === "sold") b.sold++;
    else if (l.outcome === "working") b.working++;
    else if (l.outcome === "lost") b.lost++;
    else b.unmarked++;
  }
  const brokers = [...byBroker.values()]
    .map(({ replyTimes, ...b }) => ({ ...b, medianReplyMs: median(replyTimes) }))
    .sort((a, b) => b.conversations - a.conversations || b.listingViews - a.listingViews);

  // Top listings by views
  const listing = new Map<string, { views: number; conversations: number }>();
  for (const v of visitRows) {
    if (v.kind !== "listing" || !v.deal_id) continue;
    const t = listing.get(v.deal_id) ?? { views: 0, conversations: 0 };
    t.views++;
    listing.set(v.deal_id, t);
  }
  for (const l of leadRows) {
    if (!l.deal_id) continue;
    const t = listing.get(l.deal_id) ?? { views: 0, conversations: 0 };
    t.conversations++;
    listing.set(l.deal_id, t);
  }
  const topIds = [...listing.entries()]
    .sort((a, b) => b[1].views - a[1].views || b[1].conversations - a[1].conversations)
    .slice(0, 10);
  const { data: topDeals } = topIds.length
    ? await admin
        .from("deals")
        .select("id, year, make, model, trim")
        .in(
          "id",
          topIds.map(([id]) => id)
        )
        .returns<{ id: string; year: number; make: string; model: string; trim: string | null }[]>()
    : { data: [] };
  const titles = new Map((topDeals ?? []).map((d) => [d.id, [d.year, d.make, d.model, d.trim].filter(Boolean).join(" ")]));
  const topListings = topIds.map(([dealId, t]) => ({ dealId, title: titles.get(dealId) ?? "Removed listing", ...t }));

  // Latest leads
  const latest = leadRows.slice(0, 50);
  const names = await participantNames(latest);
  const recent: LeadItem[] = latest.map((l) => ({
    id: l.id,
    createdAt: l.created_at,
    shopper: names.customers.get(l.customer_id) ?? "Shopper",
    broker: brokerNames.get(l.broker_id) ?? names.brokers.get(l.broker_id) ?? "Broker",
    car: l.deal_label || "—",
    source: sourceKey(l.source, l.campaign),
    replyMs: l.first_broker_reply_at
      ? Math.max(0, new Date(l.first_broker_reply_at).getTime() - new Date(l.created_at).getTime())
      : null,
    waiting: isWaiting(l, now),
    outcome: l.outcome,
  }));

  return {
    totals: {
      visitors: allVisitors.size,
      listingViews: visitRows.filter((v) => v.kind === "listing").length,
      signups: (signups.data ?? []).length,
      conversations: leadRows.length,
      replied: leadRows.filter((l) => l.first_broker_reply_at).length,
      sold: leadRows.filter((l) => l.outcome === "sold").length,
    },
    sources,
    states,
    cities,
    brokers,
    topListings,
    recent,
    ready,
  };
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  try {
    return COUNTRY_NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
