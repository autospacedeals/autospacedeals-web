// Daily "did any of these sell?" check-in email to brokers, so the admin
// Leads page knows which conversations ended in a sale (supabase/migrations/
// 0033_lead_tracking.sql schedules it with pg_cron, same CRON_SYNC_SECRET as
// the other jobs).
//
// Asks about conversations at least 3 days old (and under 60) that aren't
// marked sold or didn't-buy yet, at most once a week each. One email per
// broker per run, listing up to 10 of them, each with one-click answers
// (/lead-outcome, signed links — no login needed).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { participantNames, conversationPath } from "@/lib/messages";
import { OUTCOMES_ENABLED, OUTCOME_LABELS, outcomeToken, type LeadOutcome } from "@/lib/leads";
import { emailLayoutHtml, emailLinkHtml, escapeHtml, isEmailConfigured, sendEmail, siteLink } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 24 * 60 * 60 * 1000;
const MIN_AGE_DAYS = 3;
const MAX_AGE_DAYS = 60;
const REASK_DAYS = 7;
const MAX_PER_EMAIL = 10;
const SEND_INTERVAL_MS = 550;
const TIME_BUDGET_MS = 45000;

interface Lead {
  id: string;
  customer_id: string;
  broker_id: string;
  deal_label: string;
  created_at: string;
  outcome: string | null;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SYNC_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function outcomeLink(id: string, o: LeadOutcome): string {
  return siteLink(`/lead-outcome?c=${id}&o=${o}&t=${outcomeToken(id, o)}`);
}

const ORDER: LeadOutcome[] = ["sold", "working", "lost"];

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!OUTCOMES_ENABLED) return NextResponse.json({ sent: 0, note: "check-ins are switched off" });
  if (!isEmailConfigured()) return NextResponse.json({ sent: 0, note: "email not configured" });

  const started = Date.now();
  const admin = createAdminClient();
  const now = Date.now();
  const { data, error } = await admin
    .from("conversations")
    .select("id, customer_id, broker_id, deal_label, created_at, outcome")
    .lte("created_at", new Date(now - MIN_AGE_DAYS * DAY).toISOString())
    .gte("created_at", new Date(now - MAX_AGE_DAYS * DAY).toISOString())
    .or("outcome.is.null,outcome.eq.working")
    .or(`outcome_asked_at.is.null,outcome_asked_at.lte.${new Date(now - REASK_DAYS * DAY).toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(2000)
    .returns<Lead[]>();
  if (error) {
    console.error("lead-checkins: query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byBroker = new Map<string, Lead[]>();
  for (const l of data ?? []) byBroker.set(l.broker_id, [...(byBroker.get(l.broker_id) ?? []), l]);
  const names = await participantNames(data ?? []);

  let sent = 0;
  const failures: string[] = [];
  for (const [brokerId, all] of byBroker) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const leads = all.slice(-MAX_PER_EMAIL).reverse();
    try {
      const { data: auth } = await admin.auth.admin.getUserById(brokerId);
      const to = auth?.user?.email;
      if (!to) continue;

      const rows = leads.map((l) => {
        const shopper = (names.customers.get(l.customer_id) ?? "A shopper").split(" ")[0];
        const day = new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const what = l.deal_label || "a listing";
        return {
          html:
            `<tr><td style="padding:12px 0;border-top:1px solid #e6e8ec;">` +
            `<p style="margin:0;font-weight:600;color:#14161a;">${escapeHtml(what)}</p>` +
            `<p style="margin:2px 0 8px 0;font-size:13px;color:#6b7280;">${escapeHtml(shopper)} · messaged ${escapeHtml(day)}` +
            `${l.outcome === "working" ? " · you said still working" : ""} · ` +
            `${emailLinkHtml(siteLink(conversationPath("broker", l.id)), "Open conversation")}</p>` +
            `<p style="margin:0;">${ORDER.map((o) => emailLinkHtml(outcomeLink(l.id, o), OUTCOME_LABELS[o])).join(" &nbsp;·&nbsp; ")}</p>` +
            `</td></tr>`,
          text:
            `${what} — ${shopper}, messaged ${day}\n` +
            ORDER.map((o) => `  ${OUTCOME_LABELS[o]}: ${outcomeLink(l.id, o)}`).join("\n"),
        };
      });
      const count = leads.length === 1 ? "this shopper" : `these ${leads.length} shoppers`;
      const html = emailLayoutHtml({
        preheader: `A quick check-in on ${count} from Drive.`,
        heading: leads.length === 1 ? "Did this one sell?" : "Did any of these sell?",
        bodyHtml:
          `<p style="margin:0 0 8px 0;">A quick check-in on ${count} who messaged you on Drive. ` +
          `Tap an answer for each — it takes a second, no login needed.</p>` +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map((r) => r.html).join("")}</table>`,
        footerHtml:
          "Only Drive sees your answers. They show us which ads bring you real buyers, so we can send you more of them. " +
          "Still working on one? We'll check back in a week.",
      });
      const text =
        `A quick check-in on ${count} who messaged you on Drive. Open a link to answer:\n\n` +
        rows.map((r) => r.text).join("\n\n") +
        `\n\nOnly Drive sees your answers. Still working on one? We'll check back in a week.`;

      const result = await sendEmail({
        to,
        subject: leads.length === 1 ? `Did the ${leads[0].deal_label || "deal"} sell?` : "Did any of these Drive leads sell?",
        html,
        text,
      });
      if (!result.ok) {
        failures.push(`${brokerId}: ${result.error}`);
        if (result.status === 429) break;
        continue;
      }
      sent++;
      await admin
        .from("conversations")
        .update({ outcome_asked_at: new Date().toISOString() })
        .in(
          "id",
          leads.map((l) => l.id)
        );
      await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    } catch (err) {
      failures.push(`${brokerId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (failures.length) console.error("lead-checkins failures:", failures);
  return NextResponse.json({ brokers: byBroker.size, sent, failures: failures.length });
}
