"use server";

// "Get matched with similar deals" on a deal page (components/GetMatched.tsx):
// emails a one-time list of the similar deals shown under the listing.
//
// Everything that arrives here is client-supplied, so:
//   - the browser only sends the deal's id and the similar deals' ids the
//     page already computed; both are re-read from the database and only
//     listings that are published right now make it into the email, which
//     is built entirely from database data (lib/email.ts escapes it);
//   - a signed-in customer's email always goes to their own account
//     address — any address the browser sends is ignored — and only they
//     can ask for an alert (a saved search, see lib/supabase/saved-searches.ts,
//     which takes the customer from the session);
//   - everyone else types an address, so sends are limited to 3 per address
//     and 10 per IP address in any 24 hours, logged in match_email_log
//     (supabase/migrations/0018_match_email_log.sql, service role only).
//     The per-address limit counts the mailbox, not the spelling: "+tags"
//     and Gmail's ignored dots are taken out first (rateLimitKey), so
//     name+1@gmail.com and n.ame@gmail.com share name@gmail.com's three.
//     A hidden "website" field catches form-filling bots: they're told it
//     worked and nothing is sent.
//
// Degrades gracefully: before 0018 has been run the log can't be written,
// so signed-in customers still get their email but signed-out requests are
// refused rather than sent without any limit.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { Deal } from "@/lib/deals-data";
import { dealTitle } from "@/lib/deal-utils";
import {
  EMAIL_MAX,
  INVALID_EMAIL_MESSAGE,
  MAX_SIMILAR_IDS,
  isValidEmailAddress,
} from "@/lib/get-matched";
import { MANAGE_ALERTS_PATH, matchAlertFilters, matchAlertLabel } from "@/lib/saved-searches";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getPublishedDealsByIds } from "@/lib/supabase/deals";
import { createSavedSearch, isMissingRelationError } from "@/lib/supabase/saved-searches";
import { withTimeout } from "@/lib/supabase/with-timeout";
import {
  dealLink,
  dealListEmailHtml,
  dealListEmailText,
  emailLayoutHtml,
  emailLinkHtml,
  escapeHtml,
  isEmailConfigured,
  sendEmail,
  siteLink,
} from "@/lib/email";

// What the "Email me when new matching deals are posted" box led to:
// null when it wasn't offered or wasn't ticked.
export type MatchAlertOutcome = "created" | "exists" | "failed" | null;

export type GetMatchedErrorCode =
  | "invalid"
  | "invalid-email"
  // The dialog thought this was a signed-in customer (so sent no address),
  // but the server doesn't see one any more: the session ended, they
  // logged out in another tab, or switched to a broker account.
  | "signed-out"
  | "rate-limited"
  | "not-configured"
  | "unavailable"
  | "not-listed"
  | "failed";

// alertError: why the alert couldn't be set up, in words for the shopper
// (alertLimitReached when it's because they have as many as they can).
export type GetMatchedResult =
  | { ok: true; alert: MatchAlertOutcome; alertError?: string; alertLimitReached?: boolean }
  // alert: set when the alert was set up but the email then didn't go out,
  // so the dialog can say the alert is there.
  | { ok: false; code: GetMatchedErrorCode; error: string; alert?: MatchAlertOutcome };

const EMAILS_PER_ADDRESS_PER_DAY = 3;
const EMAILS_PER_IP_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
// Now and then a send also clears out log rows older than this, so the
// table doesn't keep addresses and IPs longer than the limits need.
const LOG_RETENTION_DAYS = 7;
const LOG_CLEANUP_CHANCE = 0.05;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVALID_REQUEST = "Something went wrong with this request. Refresh the page and try again.";
const SEND_FAILED = "We couldn't send the email. Please try again in a few minutes.";
const RATE_LIMITED = "You've asked for a lot of matches today. Please try again tomorrow.";
const NOT_CONFIGURED = "Email matching isn't set up yet. Please check back soon.";
const UNAVAILABLE = "Email matching isn't available right now. Please try again later.";
const NOT_LISTED = "This deal is no longer listed, so we can't match it.";
const SIGNED_OUT = "It looks like you're no longer logged in. Log in again, or enter an email address.";

function fail(code: GetMatchedErrorCode, error: string): GetMatchedResult {
  return { ok: false, code, error };
}

interface ParsedInput {
  dealId: string;
  similarIds: string[];
  email: string | null;
  honeypot: boolean;
  subscribe: boolean;
}

// Type- and bounds-checks the request. Returns null for anything the
// site's own dialog couldn't have sent.
function parseInput(raw: unknown): ParsedInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const { dealId, similarIds, email, website, subscribe } = input;
  if (typeof dealId !== "string" || !UUID_RE.test(dealId)) return null;
  if (!Array.isArray(similarIds) || similarIds.length > MAX_SIMILAR_IDS) return null;
  if (!similarIds.every((id): id is string => typeof id === "string" && UUID_RE.test(id))) return null;
  if (email !== undefined && email !== null && (typeof email !== "string" || email.length > EMAIL_MAX * 2)) {
    return null;
  }
  if (website !== undefined && website !== null && (typeof website !== "string" || website.length > 500)) {
    return null;
  }
  if (subscribe !== undefined && typeof subscribe !== "boolean") return null;

  const normalizedDealId = dealId.toLowerCase();
  const uniqueSimilar = [...new Set(similarIds.map((id) => id.toLowerCase()))].filter(
    (id) => id !== normalizedDealId
  );
  return {
    dealId: normalizedDealId,
    similarIds: uniqueSimilar,
    email: typeof email === "string" && email.trim() ? email.trim() : null,
    honeypot: typeof website === "string" && website.trim() !== "",
    subscribe: subscribe === true,
  };
}

// The per-address rate-limit key: the lowercased address with anything
// that still delivers to the same mailbox taken out — a "+tag" on the
// local part (for every domain), and for Gmail the dots, which it ignores
// (googlemail.com is the same mailboxes as gmail.com). The email itself
// still goes to the address as typed.
function rateLimitKey(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    domain = "gmail.com";
    local = local.replace(/\./g, "") || local;
  }
  return `${local}@${domain}`;
}

const IP_RE = /^[0-9a-f:.]{2,45}$/;
// An IPv4 address with a port on the end ("1.2.3.4:5678"), which some
// proxies send.
const IPV4_WITH_PORT_RE = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/;
let warnedNoIp = false;

function cleanIp(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase() ?? "";
  if (!value) return null;
  const ip = value.match(IPV4_WITH_PORT_RE)?.[1] ?? value;
  return IP_RE.test(ip) ? ip : null;
}

// The requester's IP address as Vercel reports it (the first entry of
// x-forwarded-for is the client; x-real-ip is the same thing), or null if
// neither header holds anything usable — logged, since signed-out sends
// then have only the per-address limit.
async function requesterIp(): Promise<string | null> {
  const list = await headers();
  const ip = cleanIp(list.get("x-forwarded-for")?.split(",")[0]) ?? cleanIp(list.get("x-real-ip"));
  if (!ip && !warnedNoIp) {
    warnedNoIp = true;
    console.error("getMatched: no usable x-forwarded-for / x-real-ip header; the per-IP limit is skipped");
  }
  return ip;
}

type Recipient =
  | { kind: "customer"; email: string }
  | { kind: "guest"; email: string }
  | { kind: "error"; result: GetMatchedResult };

// Who the email goes to. A signed-in customer: their account address,
// whatever was submitted. Anyone else (signed out, or a broker/admin
// account, which has no customers row): the address they typed. No
// address at all means the dialog showed the customer form to someone the
// server doesn't see as a customer (any more).
async function resolveRecipient(submitted: string | null): Promise<Recipient> {
  const guest = (): Recipient => {
    if (!submitted) return { kind: "error", result: fail("signed-out", SIGNED_OUT) };
    if (!isValidEmailAddress(submitted)) return { kind: "error", result: fail("invalid-email", INVALID_EMAIL_MESSAGE) };
    return { kind: "guest", email: submitted.toLowerCase() };
  };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), 5000, "getMatched getUser");
    if (!user) return guest();

    const { data: customer, error } = await withTimeout(
      supabase.from("customers").select("id").eq("id", user.id).maybeSingle<{ id: string }>(),
      5000,
      "getMatched customer lookup"
    );
    if (error) {
      console.error("getMatched customer lookup failed:", error.code, error.message);
      // Can't tell whether this is a customer; an address typed into the
      // guest form can still be used, but a customer's form has none.
      return submitted ? guest() : { kind: "error", result: fail("failed", SEND_FAILED) };
    }
    if (!customer) return guest();

    const email = user.email?.trim().toLowerCase() ?? "";
    if (!isValidEmailAddress(email)) {
      return {
        kind: "error",
        result: fail("failed", "Your account doesn't have an email address we can send to."),
      };
    }
    return { kind: "customer", email };
  } catch (err) {
    console.error("getMatched session lookup threw:", err);
    return submitted ? guest() : { kind: "error", result: fail("failed", SEND_FAILED) };
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

type Reservation =
  | { kind: "reserved"; logId: string }
  | { kind: "limited"; logId: null }
  // The log table doesn't exist yet, or couldn't be used.
  | { kind: "unavailable"; logId: null };

async function countSince(
  admin: AdminClient,
  column: "email" | "ip",
  value: string,
  sinceIso: string
): Promise<number | null> {
  const { count, error } = await withTimeout(
    admin
      .from("match_email_log")
      .select("id", { count: "exact", head: true })
      .eq(column, value)
      .gte("created_at", sinceIso),
    5000,
    `match_email_log count by ${column}`
  );
  if (error) {
    console.error(`match_email_log count by ${column} failed:`, error.code, error.message);
    return null;
  }
  return count ?? 0;
}

async function deleteLogRow(admin: AdminClient, logId: string) {
  try {
    const { error } = await withTimeout(
      admin.from("match_email_log").delete().eq("id", logId),
      5000,
      "match_email_log delete"
    );
    if (error) console.error("match_email_log delete failed:", error.code, error.message);
  } catch (err) {
    console.error("match_email_log delete threw:", err);
  }
}

// Logs the send up front and then counts, so two requests racing each
// other both see the other's row (at worst one is refused that could have
// gone out). A refused or failed send takes its row back out. The log's
// email column holds the rate-limit key (rateLimitKey), not the address
// as typed.
async function reserveSend(
  admin: AdminClient,
  recipient: string,
  ip: string | null,
  dealId: string
): Promise<Reservation> {
  const email = rateLimitKey(recipient);
  try {
    const { data, error } = await withTimeout(
      admin
        .from("match_email_log")
        .insert({ email, ip, deal_id: dealId })
        .select("id")
        .single<{ id: string }>(),
      5000,
      "match_email_log insert"
    );
    if (error || !data?.id) {
      if (error) {
        const why = isMissingRelationError(error.code) ? "table missing" : error.message;
        console.error("match_email_log insert failed:", error.code, why);
      }
      return { kind: "unavailable", logId: null };
    }

    const sinceIso = new Date(Date.now() - DAY_MS).toISOString();
    const [byEmail, byIp] = await Promise.all([
      countSince(admin, "email", email, sinceIso),
      ip ? countSince(admin, "ip", ip, sinceIso) : Promise.resolve(0),
    ]);
    if (byEmail === null || byIp === null) {
      await deleteLogRow(admin, data.id);
      return { kind: "unavailable", logId: null };
    }
    if (byEmail > EMAILS_PER_ADDRESS_PER_DAY || byIp > EMAILS_PER_IP_PER_DAY) {
      await deleteLogRow(admin, data.id);
      return { kind: "limited", logId: null };
    }
    return { kind: "reserved", logId: data.id };
  } catch (err) {
    console.error("match_email_log reservation threw:", err);
    return { kind: "unavailable", logId: null };
  }
}

async function cleanUpOldLogRows(admin: AdminClient) {
  if (Math.random() >= LOG_CLEANUP_CHANCE) return;
  try {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * DAY_MS).toISOString();
    const { error } = await withTimeout(
      admin.from("match_email_log").delete().lt("created_at", cutoff),
      5000,
      "match_email_log clean-up"
    );
    if (error) console.error("match_email_log clean-up failed:", error.code, error.message);
  } catch (err) {
    console.error("match_email_log clean-up threw:", err);
  }
}

function buildEmail(deal: Deal, similar: Deal[], forCustomer: boolean, alert: MatchAlertOutcome) {
  const title = dealTitle(deal);
  const subject = `Deals similar to ${title}`;
  const originalUrl = dealLink(deal);
  const allDealsUrl = siteLink("/#deals");
  const manageUrl = siteLink(MANAGE_ALERTS_PATH);
  const hasAlert = alert === "created" || alert === "exists";
  const count = similar.length;

  const introText =
    count > 0
      ? `Here ${count === 1 ? "is a deal" : `are ${count} deals`} similar to the ${title} you were looking at on Drive.`
      : `You asked for deals similar to the ${title} you were looking at on Drive.`;
  const introHtml =
    count > 0
      ? `Here ${count === 1 ? "is a deal" : `are ${count} deals`} similar to the ${emailLinkHtml(originalUrl, title)} you were looking at on Drive.`
      : `You asked for deals similar to the ${emailLinkHtml(originalUrl, title)} you were looking at on Drive.`;
  const noneText =
    "We don't have other listings like it right now, but new deals are posted all the time.";

  const bodyHtml = `
<p style="margin:0 0 20px 0;">${introHtml}</p>
${
  count > 0
    ? dealListEmailHtml(similar)
    : `<p style="margin:0 0 20px 0;">${escapeHtml(noneText)} ${emailLinkHtml(allDealsUrl, "Browse all deals on Drive")}.</p>`
}
<p style="margin:0 0 20px 0;">${emailLinkHtml(originalUrl, `Back to the ${title}`)}${
    count > 0 ? ` &nbsp;·&nbsp; ${emailLinkHtml(allDealsUrl, "Browse all deals")}` : ""
  }</p>
${
  hasAlert
    ? `<p style="margin:0 0 20px 0;">We'll also email you when new deals like this are posted. ${emailLinkHtml(manageUrl, "Manage alerts")}.</p>`
    : ""
}`;

  const reason = forCustomer
    ? "You're getting this because you asked for similar deals on Drive."
    : "You're getting this one-time email because this address was entered on Drive to get matched with similar deals. We won't email you again unless you ask.";
  const footerHtml = `
<p style="margin:16px 0 0 0;">${escapeHtml(reason)} Prices and availability are set by each dealer or broker and can change — confirm details with the seller.</p>`;

  const text = [
    introText,
    "",
    ...(count > 0 ? [dealListEmailText(similar)] : [noneText, `Browse all deals: ${allDealsUrl}`]),
    "",
    `Back to the ${title}: ${originalUrl}`,
    ...(hasAlert ? ["", `We'll also email you when new deals like this are posted. Manage alerts: ${manageUrl}`] : []),
    "",
    reason,
  ].join("\n");

  return {
    subject,
    html: emailLayoutHtml({ preheader: introText, heading: subject, bodyHtml, footerHtml }),
    text,
  };
}

export async function getMatchedAction(raw: unknown): Promise<GetMatchedResult> {
  const input = parseInput(raw);
  if (!input) return fail("invalid", INVALID_REQUEST);
  // A bot filled in the hidden field: say it worked, do nothing.
  if (input.honeypot) return { ok: true, alert: null };

  if (!isEmailConfigured()) return fail("not-configured", NOT_CONFIGURED);

  const recipient = await resolveRecipient(input.email);
  if (recipient.kind === "error") return recipient.result;
  const forCustomer = recipient.kind === "customer";

  const found = await getPublishedDealsByIds([input.dealId, ...input.similarIds]);
  if (!found) return fail("failed", SEND_FAILED);
  const byId = new Map(found.map((d) => [d.id.toLowerCase(), d]));
  const deal = byId.get(input.dealId);
  if (!deal) return fail("not-listed", NOT_LISTED);
  // In the order the page showed them; anything no longer published drops out.
  const similar = input.similarIds.map((id) => byId.get(id)).filter((d): d is Deal => Boolean(d));

  let admin: AdminClient | null = null;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("getMatched: admin client unavailable:", err);
  }
  const reservation: Reservation = admin
    ? await reserveSend(admin, recipient.email, await requesterIp(), deal.id)
    : { kind: "unavailable", logId: null };
  if (reservation.kind === "limited") return fail("rate-limited", RATE_LIMITED);
  // Without the log there's no limit to hold signed-out requests to.
  if (reservation.kind === "unavailable" && !forCustomer) return fail("unavailable", UNAVAILABLE);

  // Set up first so the email can say so. Saving the same alert twice
  // doesn't add a second one (createSavedSearch checks for it). If the
  // email then fails, the result still says the alert is there.
  let alert: MatchAlertOutcome = null;
  let alertError: string | undefined;
  let alertLimitReached: boolean | undefined;
  if (forCustomer && input.subscribe) {
    try {
      const saved = await createSavedSearch(matchAlertFilters(deal), matchAlertLabel(deal));
      if (saved.ok) {
        alert = saved.alreadySaved ? "exists" : "created";
        if (!saved.alreadySaved) revalidatePath("/customer/dashboard");
      } else {
        console.error("getMatched: alert not saved:", saved.error);
        alert = "failed";
        // createSavedSearch's messages are written for shoppers.
        alertError = saved.error;
        alertLimitReached = saved.limitReached === true || undefined;
      }
    } catch (err) {
      console.error("getMatched: createSavedSearch threw:", err);
      alert = "failed";
    }
  }

  const email = buildEmail(deal, similar, forCustomer, alert);
  const sent = await sendEmail({ to: recipient.email, subject: email.subject, html: email.html, text: email.text });
  if (!sent.ok) {
    console.error("getMatched: send failed:", sent.error);
    if (admin && reservation.logId) await deleteLogRow(admin, reservation.logId);
    return { ok: false, code: "failed", error: SEND_FAILED, alert };
  }

  if (admin && reservation.kind === "reserved") await cleanUpOldLogRows(admin);
  return { ok: true, alert, alertError, alertLimitReached };
}
