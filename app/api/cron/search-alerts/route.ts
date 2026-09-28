// Saved-search alert emails (see supabase/migrations/0017_saved_searches.sql).
// Like the sheet sync, not triggered by Vercel Cron directly (the Hobby plan
// only allows once-a-day schedules) — a GitHub Actions workflow
// (.github/workflows/send-search-alerts.yml) hits this every hour with the
// same CRON_SYNC_SECRET.
//
// Each run: load every saved search and every deal published in the last
// two weeks; for each search, find deals published after the search was
// saved that match its filters (the homepage's own filterDeals) and haven't
// been emailed for it before (saved_search_matches); if there are any, send
// ONE digest email to the customer's account address, then record those
// deals as sent and stamp last_alerted_at. A failure on one search is
// logged and reported without stopping the rest.
//
// Sends are paced under Resend's API rate limit, and a 429 ends the run
// early. Each customer gets at most a few alert emails per run and per day,
// so one account with many near-identical searches can't use up the
// sending quota for everyone else. Anything held back stays unsent and goes
// out on a later run (least recently alerted searches come first).
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { DEAL_COLUMNS, mapRowToDeal, type DealRow } from "@/lib/supabase/deals";
import { isMissingRelationError } from "@/lib/supabase/saved-searches";
import type { Deal } from "@/lib/deals-data";
import { filterDeals } from "@/lib/deal-utils";
import {
  MANAGE_ALERTS_PATH,
  hasActiveFilters,
  parseSavedSearchFilters,
  savedSearchLabel,
} from "@/lib/saved-searches";
import {
  dealListEmailHtml,
  dealListEmailText,
  emailLayoutHtml,
  emailLinkHtml,
  escapeHtml,
  isEmailConfigured,
  sendEmail,
  siteLink,
} from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Only deals published this recently are considered. Far longer than the
// hourly schedule, so a few missed runs (or an email outage) still catch up.
const LOOKBACK_DAYS = 14;
// Deals listed in one email; the rest are summed up as "and N more".
const MAX_DEALS_PER_EMAIL = 10;
// Stop starting new searches after this long, well inside maxDuration —
// whatever's left is picked up by the next run (nothing is marked sent
// until its email has gone out).
const TIME_BUDGET_MS = 45000;
// Resend allows about 2 requests a second by default; waiting this long
// after each send keeps a run under it.
const SEND_INTERVAL_MS = 550;
// Per customer: alert emails per run, and how many of their searches can
// be alerted in a rolling day (each search emails at most once a run, and
// only when a new matching deal is published).
const MAX_EMAILS_PER_CUSTOMER_PER_RUN = 3;
const MAX_ALERTED_SEARCHES_PER_CUSTOMER_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_PAGE_SIZE = 1000;
const MAX_SEARCH_PAGES = 20;

interface SavedSearchRow {
  id: string;
  customer_id: string;
  filters: unknown;
  label: string | null;
  unsubscribe_token: string;
  created_at: string;
  last_alerted_at: string | null;
}

type RecentDealRow = DealRow & { published_at: string | null };

interface RecentDeal {
  deal: Deal;
  publishedAt: number;
}

interface SearchResult {
  searchId: string;
  matched: number;
  sent: number;
  error: string | null;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SYNC_SECRET;
  if (!secret) return false; // refuse to run at all if it isn't configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadSavedSearches(
  supabase: AdminClient
): Promise<{ rows: SavedSearchRow[]; error: { code?: string; message: string } | null }> {
  const rows: SavedSearchRow[] = [];
  // Least recently alerted first, so if a run ever hits its time budget the
  // searches it didn't reach go first next time.
  for (let page = 0; page < MAX_SEARCH_PAGES; page++) {
    const { data, error } = await supabase
      .from("saved_searches")
      .select("id, customer_id, filters, label, unsubscribe_token, created_at, last_alerted_at")
      .order("last_alerted_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .range(page * SEARCH_PAGE_SIZE, (page + 1) * SEARCH_PAGE_SIZE - 1)
      .returns<SavedSearchRow[]>();
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < SEARCH_PAGE_SIZE) break;
  }
  return { rows, error: null };
}

async function loadRecentDeals(
  supabase: AdminClient,
  sinceIso: string
): Promise<{ deals: RecentDeal[]; error: { code?: string; message: string } | null }> {
  const { data, error } = await supabase
    .from("deals")
    .select(`${DEAL_COLUMNS}, published_at`)
    .eq("status", "published")
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    .limit(1000)
    .returns<RecentDealRow[]>();
  if (error) return { deals: [], error };

  // Mapped one at a time so a single malformed row is skipped (and logged).
  const deals: RecentDeal[] = [];
  for (const row of data ?? []) {
    const publishedAt = row?.published_at ? Date.parse(row.published_at) : NaN;
    if (!Number.isFinite(publishedAt)) continue;
    try {
      deals.push({ deal: mapRowToDeal(row), publishedAt });
    } catch (err) {
      console.error("Cron search-alerts: mapRowToDeal failed for deal", row?.id, err);
    }
  }
  return { deals, error: null };
}

// The customer's account email, only once they've confirmed they own it —
// alerts never go to an address nobody has verified.
async function lookUpEmail(supabase: AdminClient, customerId: string): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(customerId);
  if (error) throw new Error(`getUserById failed: ${error.message}`);
  const user = data?.user;
  if (!user?.email || !user.email_confirmed_at) return null;
  return user.email;
}

function buildEmail(label: string, deals: Deal[], totalNew: number, unsubscribeUrl: string) {
  const more = totalNew - deals.length;
  const countText = `${totalNew} new ${totalNew === 1 ? "deal matches" : "deals match"}`;
  const subject = `${countText} your saved search`;
  const heading = totalNew === 1 ? "A new deal matches your search" : "New deals match your search";
  const allDealsUrl = siteLink("/#deals");
  const manageUrl = siteLink(MANAGE_ALERTS_PATH);

  const bodyHtml = `
<p style="margin:0 0 20px 0;">${escapeHtml(countText)} your saved search <strong style="color:#111318;">${escapeHtml(label)}</strong>.</p>
${dealListEmailHtml(deals)}
${
  more > 0
    ? `<p style="margin:0 0 20px 0;">And ${more} more — ${emailLinkHtml(allDealsUrl, "see all deals on Drive")}.</p>`
    : ""
}`;
  const footerHtml = `
<p style="margin:16px 0 0 0;">You're getting this because you saved this search on Drive. Prices and availability are set by each dealer or broker and can change — confirm details with the seller.</p>
<p style="margin:12px 0 0 0;">${emailLinkHtml(manageUrl, "Manage alerts")} &nbsp;·&nbsp; ${emailLinkHtml(unsubscribeUrl, "Stop these alerts")}</p>`;

  const text = [
    `${countText} your saved search "${label}".`,
    "",
    dealListEmailText(deals),
    ...(more > 0 ? ["", `And ${more} more: ${allDealsUrl}`] : []),
    "",
    "You're getting this because you saved this search on Drive.",
    `Manage alerts: ${manageUrl}`,
    `Stop these alerts: ${unsubscribeUrl}`,
  ].join("\n");

  return {
    subject,
    html: emailLayoutHtml({ preheader: `${countText} "${label}".`, heading, bodyHtml, footerHtml }),
    text,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Nothing to do without an email provider — reported as a skip, not a
  // failure, so the scheduled workflow doesn't go red before it's set up.
  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: "email not configured" });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();

  const { rows: searches, error: searchesError } = await loadSavedSearches(supabase);
  if (searchesError) {
    console.error("Cron search-alerts: failed to load saved_searches:", searchesError.code, searchesError.message);
    // Before the 0017 migration has been run: same reasoning as above.
    if (isMissingRelationError(searchesError.code)) {
      return NextResponse.json({ skipped: "saved searches not set up" });
    }
    return NextResponse.json({ error: searchesError.message }, { status: 500 });
  }
  if (searches.length === 0) {
    return NextResponse.json({ checked: 0, recentDeals: 0, emailsSent: 0, results: [] });
  }

  const sinceIso = new Date(startedAt - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { deals: recentDeals, error: dealsError } = await loadRecentDeals(supabase, sinceIso);
  if (dealsError) {
    console.error("Cron search-alerts: failed to load recent deals:", dealsError.code, dealsError.message);
    if (isMissingRelationError(dealsError.code)) {
      return NextResponse.json({ skipped: "saved searches not set up" });
    }
    return NextResponse.json({ error: dealsError.message }, { status: 500 });
  }

  const publishedAtById = new Map(recentDeals.map((d) => [d.deal.id, d.publishedAt]));
  const emails = new Map<string, string | null>();
  const results: SearchResult[] = [];
  let emailsSent = 0;
  let deferred = 0;
  // Searches skipped because their customer hit a per-run or per-day cap.
  let capped = 0;
  let rateLimited = false;

  // Per-customer send counts: this run, and alerted in the last day
  // (starting from each search's last_alerted_at).
  const sentThisRun = new Map<string, number>();
  const alertedToday = new Map<string, number>();
  const alertedSince = (iso: string | null) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(at) && at > startedAt - DAY_MS;
  };
  for (const search of searches) {
    if (alertedSince(search.last_alerted_at)) {
      alertedToday.set(search.customer_id, (alertedToday.get(search.customer_id) ?? 0) + 1);
    }
  }
  let lastSendAt = 0;

  for (const [index, search] of searches.entries()) {
    if (recentDeals.length === 0) break;
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      deferred = searches.length - index;
      break;
    }
    if (
      (sentThisRun.get(search.customer_id) ?? 0) >= MAX_EMAILS_PER_CUSTOMER_PER_RUN ||
      (alertedToday.get(search.customer_id) ?? 0) >= MAX_ALERTED_SEARCHES_PER_CUSTOMER_PER_DAY
    ) {
      capped++;
      continue;
    }

    try {
      const filters = parseSavedSearchFilters(search.filters);
      if (!filters || !hasActiveFilters(filters)) {
        results.push({ searchId: search.id, matched: 0, sent: 0, error: "Unreadable filters" });
        continue;
      }
      const savedAt = Date.parse(search.created_at);
      if (!Number.isFinite(savedAt)) {
        results.push({ searchId: search.id, matched: 0, sent: 0, error: "Unreadable created_at" });
        continue;
      }

      // Only listings that went live after the search was saved.
      const candidates = recentDeals.filter((d) => d.publishedAt > savedAt).map((d) => d.deal);
      const matched = filterDeals(candidates, filters);
      if (matched.length === 0) continue;

      // Anything already emailed for this search was sent after it was
      // published, so it's within the same lookback window.
      const { data: sentRows, error: sentError } = await supabase
        .from("saved_search_matches")
        .select("deal_id")
        .eq("saved_search_id", search.id)
        .gte("sent_at", sinceIso)
        .limit(2000)
        .returns<{ deal_id: string }[]>();
      if (sentError) throw new Error(`saved_search_matches lookup failed: ${sentError.message}`);
      const alreadySent = new Set((sentRows ?? []).map((row) => row.deal_id));

      const fresh = matched
        .filter((deal) => !alreadySent.has(deal.id))
        .sort((a, b) => (publishedAtById.get(b.id) ?? 0) - (publishedAtById.get(a.id) ?? 0));
      if (fresh.length === 0) continue;

      if (!emails.has(search.customer_id)) {
        emails.set(search.customer_id, await lookUpEmail(supabase, search.customer_id));
      }
      const to = emails.get(search.customer_id);
      if (!to) {
        results.push({ searchId: search.id, matched: fresh.length, sent: 0, error: "No confirmed email" });
        continue;
      }

      const label = search.label?.trim() || savedSearchLabel(filters);
      const unsubscribeUrl = siteLink(`/alerts/unsubscribe?token=${encodeURIComponent(search.unsubscribe_token)}`);
      const email = buildEmail(label, fresh.slice(0, MAX_DEALS_PER_EMAIL), fresh.length, unsubscribeUrl);
      // Same search + same deals = same key, so a retry after a failed
      // bookkeeping write below doesn't deliver the digest twice.
      const dealsHash = createHash("sha256")
        .update(fresh.map((deal) => deal.id).sort().join(","))
        .digest("hex")
        .slice(0, 32);

      const wait = lastSendAt + SEND_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastSendAt = Date.now();
      const sent = await sendEmail({
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
        idempotencyKey: `search-alert/${search.id}/${dealsHash}`,
      });
      if (!sent.ok) {
        console.error(`Cron search-alerts: send failed for search ${search.id}:`, sent.error);
        results.push({ searchId: search.id, matched: fresh.length, sent: 0, error: sent.error });
        // Rate limited: further sends this run would be rejected too, so
        // stop and leave this search and the rest for the next run.
        if (sent.status === 429) {
          rateLimited = true;
          deferred = searches.length - index;
          break;
        }
        continue;
      }
      emailsSent++;
      sentThisRun.set(search.customer_id, (sentThisRun.get(search.customer_id) ?? 0) + 1);
      if (!alertedSince(search.last_alerted_at)) {
        alertedToday.set(search.customer_id, (alertedToday.get(search.customer_id) ?? 0) + 1);
      }

      // Every new match counts as sent, including the ones summed up as
      // "and N more", so they aren't announced again next hour.
      const now = new Date().toISOString();
      const { error: matchError } = await supabase.from("saved_search_matches").upsert(
        fresh.map((deal) => ({ saved_search_id: search.id, deal_id: deal.id, sent_at: now })),
        { onConflict: "saved_search_id,deal_id", ignoreDuplicates: true }
      );
      const { error: stampError } = await supabase
        .from("saved_searches")
        .update({ last_alerted_at: now })
        .eq("id", search.id);
      const bookkeepingError = matchError?.message ?? stampError?.message ?? null;
      if (bookkeepingError) {
        console.error(`Cron search-alerts: sent but couldn't record search ${search.id}:`, bookkeepingError);
      }
      results.push({ searchId: search.id, matched: fresh.length, sent: 1, error: bookkeepingError });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Cron search-alerts: search ${search.id} threw:`, err);
      results.push({ searchId: search.id, matched: 0, sent: 0, error: message });
    }
  }

  return NextResponse.json({
    checked: searches.length,
    recentDeals: recentDeals.length,
    emailsSent,
    deferred,
    capped,
    rateLimited,
    results,
  });
}
