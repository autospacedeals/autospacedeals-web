// Catch-up texts after quiet hours (lib/quiet-hours.ts). New-message texts
// that arrived during someone's quiet hours wait in sms_held; once their
// window has ended this sends one text: the message itself when there's
// one, or a short list when there are several. A reply to it answers the
// latest conversation, like any message text. Messages they've already read
// on Drive in the meantime are dropped. Runs every 5 minutes
// (supabase/migrations/0056_sms_quiet_hours.sql schedules it with pg_cron,
// same CRON_SYNC_SECRET as the other jobs).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { conversationPath } from "@/lib/messages";
import { siteLink } from "@/lib/email";
import { isSmsConfigured, sendSms } from "@/lib/twilio";
import { inQuietHours, quietHoursOf } from "@/lib/quiet-hours";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Listed by conversation in a catch-up text, newest first; the rest are counted.
const MAX_LISTED = 4;
// Held texts older than this are dropped instead of sent (texts were turned
// back on long after, or something kept failing).
const MAX_HOLD_MS = 36 * 60 * 60 * 1000;
const TIME_BUDGET_MS = 45000;

interface Held {
  id: string;
  user_id: string;
  conversation_id: string;
  sender_name: string;
  deal_label: string | null;
  snippet: string;
  created_at: string;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SYNC_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSmsConfigured()) return NextResponse.json({ sent: 0, note: "texts not configured" });

  const started = Date.now();
  const admin = createAdminClient();
  const { data: held, error } = await admin
    .from("sms_held")
    .select("id, user_id, conversation_id, sender_name, deal_label, snippet, created_at")
    .order("created_at", { ascending: true })
    .limit(2000)
    .returns<Held[]>();
  if (error) {
    // Before the 0056 migration has run there's nothing to do.
    return NextResponse.json({ sent: 0, note: error.message });
  }
  if (!held?.length) return NextResponse.json({ sent: 0 });

  const byUser = new Map<string, Held[]>();
  for (const h of held) byUser.set(h.user_id, [...(byUser.get(h.user_id) ?? []), h]);

  let sent = 0;
  let dropped = 0;
  for (const [userId, rows] of byUser) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const { data: sms } = await admin
      .from("sms_settings")
      .select("phone, enabled, verified_at, quiet_start, quiet_end, time_zone")
      .eq("user_id", userId)
      .maybeSingle<{
        phone: string | null;
        enabled: boolean;
        verified_at: string | null;
        quiet_start: number | null;
        quiet_end: number | null;
        time_zone: string | null;
      }>();
    const ids = rows.map((r) => r.id);
    const drop = async () => {
      await admin.from("sms_held").delete().in("id", ids);
      dropped += ids.length;
    };
    // Texts turned off since: the emails already went, so nothing to send.
    if (!sms?.enabled || !sms.phone || !sms.verified_at) {
      await drop();
      continue;
    }
    if (inQuietHours(quietHoursOf(sms))) continue;

    // Leave out conversations they've read on Drive since, and stale ones.
    const convIds = [...new Set(rows.map((r) => r.conversation_id))];
    const { data: convs } = await admin
      .from("conversations")
      .select("id, broker_id, customer_last_read_at, broker_last_read_at")
      .in("id", convIds)
      .returns<{ id: string; broker_id: string; customer_last_read_at: string | null; broker_last_read_at: string | null }[]>();
    const conv = new Map((convs ?? []).map((c) => [c.id, c]));
    const pending = rows.filter((r) => {
      const c = conv.get(r.conversation_id);
      if (!c || Date.now() - new Date(r.created_at).getTime() > MAX_HOLD_MS) return false;
      const readAt = c.broker_id === userId ? c.broker_last_read_at : c.customer_last_read_at;
      return !readAt || readAt < r.created_at;
    });
    if (pending.length === 0) {
      await drop();
      continue;
    }

    // Newest message per conversation, newest conversation first.
    const latest = new Map<string, Held & { count: number }>();
    for (const r of pending) {
      const prev = latest.get(r.conversation_id);
      latest.set(r.conversation_id, { ...r, count: (prev?.count ?? 0) + 1 });
    }
    const threads = [...latest.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const newest = threads[0];
    const role = conv.get(newest.conversation_id)?.broker_id === userId ? "broker" : "customer";
    const about = (h: Held) => (h.deal_label ? ` about the ${h.deal_label}` : "");

    let text: string;
    if (pending.length === 1) {
      text =
        `Drive · ${newest.sender_name}${about(newest)} (while your quiet hours were on): "${newest.snippet}"\n\n` +
        `Reply to this text to answer, or open ${siteLink(conversationPath(role, newest.conversation_id))}`;
    } else {
      const lines = threads
        .slice(0, MAX_LISTED)
        .map((t) => `• ${t.sender_name}${about(t)}${t.count > 1 ? ` (${t.count} messages)` : ""}`);
      const more = threads.length > MAX_LISTED ? `\n• and ${threads.length - MAX_LISTED} more` : "";
      const inbox = role === "broker" ? "/broker/dashboard/messages" : "/customer/messages";
      text =
        `Drive · ${pending.length} new messages while your quiet hours were on:\n${lines.join("\n")}${more}\n\n` +
        `Reply to this text to answer ${newest.sender_name}, or see them all: ${siteLink(inbox)}`;
    }

    if (await sendSms(sms.phone, text)) {
      sent++;
      await admin
        .from("sms_settings")
        .update({ last_conversation_id: newest.conversation_id, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      await drop();
    }
    // A failed send stays held and is tried again next run (until MAX_HOLD_MS).
  }

  return NextResponse.json({ sent, dropped });
}
