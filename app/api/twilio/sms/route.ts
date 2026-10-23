// Twilio posts every text sent to Drive's number here (configured on the
// Messaging Service → Integration → incoming messages webhook). A reply from
// someone with texts turned on goes into the conversation they were last
// texted about, as a message with channel 'sms', and the other side is
// notified as usual — unless they're in two or more active conversations,
// when Drive asks which one first (see below). STOP / START keep our setting in step with Twilio's
// own opt-out handling (Twilio sends the STOP/HELP replies itself).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidTwilioSignature, smsWebhookUrl } from "@/lib/twilio";
import { conversationPath, MESSAGE_MAX, notifyOtherSide, participantNames } from "@/lib/messages";
import { siteLink } from "@/lib/email";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);

function twiml(reply?: string) {
  const body = reply
    ? `<Response><Message>${reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message></Response>`
    : "<Response></Response>";
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  if (!isValidTwilioSignature(request.headers.get("x-twilio-signature"), smsWebhookUrl(), params)) {
    console.error("Twilio webhook: bad signature");
    return new NextResponse("Forbidden", { status: 403 });
  }

  const from = params.From ?? "";
  const text = (params.Body ?? "").trim();
  const keyword = text.toUpperCase().replace(/[^A-Z]/g, "");
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("sms_settings")
    .select("user_id, enabled, verified_at, last_conversation_id")
    .eq("phone", from)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ user_id: string; enabled: boolean; verified_at: string | null; last_conversation_id: string | null }>();

  if (STOP_WORDS.has(keyword)) {
    if (settings) await admin.from("sms_settings").update({ enabled: false, updated_at: new Date().toISOString() }).eq("user_id", settings.user_id);
    return twiml();
  }
  // Only a re-subscribe when texts are off — "Yes" is also a perfectly
  // normal reply to a seller.
  if (START_WORDS.has(keyword) && !settings?.enabled) {
    if (settings?.verified_at) {
      const { error } = await admin
        .from("sms_settings")
        .update({ enabled: true, updated_at: new Date().toISOString() })
        .eq("user_id", settings.user_id);
      if (error) console.error("Twilio webhook: re-enable failed:", error.message);
    }
    return twiml();
  }
  if (HELP_WORDS.has(keyword)) return twiml();

  if (!settings?.enabled || !settings.verified_at) {
    return twiml(`Drive: This number isn't set up to reply by text. Open Drive to message: ${siteLink("/")}`);
  }
  if (!text) return twiml();

  // Which conversation the reply is for. Every text comes from Drive's one
  // number, so when someone other than the person they were last texted
  // about is also waiting on an answer (wrote last, in the last ACTIVE_MS),
  // the reply is kept and a numbered list is texted back; answering with the
  // number sends it there. Otherwise it goes to the conversation they were
  // last texted about, as always.
  const userId = settings.user_id;
  const hold = await replyHoldOf(admin, userId);
  const choice = /^\s*#?([1-9])\s*\.?\s*$/.exec(text);
  let target: string | null = null;
  let body = text;
  let confirm = false;
  if (hold && choice) {
    target = hold.options[Number(choice[1]) - 1] ?? null;
    if (!target) return twiml(`Drive: Reply with a number from 1 to ${hold.options.length}.`);
    body = hold.text;
    confirm = true;
    await clearReplyHold(admin, userId);
  } else {
    const active = await replyChoices(admin, userId, settings.last_conversation_id);
    if (active.length >= 2) {
      const options = active.slice(0, MAX_CHOICES);
      const { error: holdError } = await admin
        .from("sms_settings")
        .update({ reply_hold: text.slice(0, MESSAGE_MAX), reply_hold_options: options.map((o) => o.id), reply_hold_at: new Date().toISOString() })
        .eq("user_id", userId);
      // Before the 0057 migration this can't be saved: fall back to the
      // last-texted conversation rather than losing the reply.
      if (!holdError) {
        const list = options.map((o, i) => `${i + 1} ${o.label}`).join("\n");
        return twiml(
          `Drive: Who's this reply for?\n${list}\nReply ${options.length === 2 ? "1 or 2" : "with the number"} to send it.`
        );
      }
      console.error("Twilio webhook: saving the reply for a choice failed:", holdError.message);
    }
    target = settings.last_conversation_id ?? active[0]?.id ?? null;
    if (hold) await clearReplyHold(admin, userId);
  }
  if (!target) {
    return twiml(`Drive: We couldn't tell which conversation this is for. Reply on Drive: ${siteLink("/")}`);
  }

  const { data: c } = await admin
    .from("conversations")
    .select("id, customer_id, broker_id, deal_label")
    .eq("id", target)
    .maybeSingle<{ id: string; customer_id: string; broker_id: string; deal_label: string | null }>();
  const role = c?.customer_id === settings.user_id ? "customer" : c?.broker_id === settings.user_id ? "broker" : null;
  if (!c || !role) {
    return twiml(`Drive: That conversation isn't available anymore. Open Drive: ${siteLink("/")}`);
  }

  body = body.slice(0, MESSAGE_MAX);
  const { error } = await admin
    .from("messages")
    .insert({ conversation_id: c.id, sender_id: settings.user_id, sender_role: role, body, channel: "sms" });
  if (error) {
    console.error("Twilio webhook: message insert failed:", error.message);
    return twiml(`Drive: Your reply didn't go through. Please reply on Drive: ${siteLink(conversationPath(role, c.id))}`);
  }
  await notifyOtherSide(c.id, role, body);
  // The next reply goes to the same place unless they pick another.
  await admin.from("sms_settings").update({ last_conversation_id: c.id }).eq("user_id", userId);
  if (!confirm) return twiml();
  const names = await participantNames([c]);
  const to = role === "broker" ? names.customers.get(c.customer_id) ?? "the shopper" : names.brokers.get(c.broker_id) ?? "the seller";
  return twiml(`Drive: Sent to ${to}${c.deal_label ? ` about the ${c.deal_label}` : ""}.`);
}

// A conversation is waiting on them when the other side wrote last, lately.
const ACTIVE_MS = 12 * 60 * 60 * 1000;
// A kept reply waits this long for its number.
const HOLD_MS = 30 * 60 * 1000;
const MAX_CHOICES = 5;

type Admin = ReturnType<typeof createAdminClient>;

// The conversations a text reply could be meant for: everyone waiting on an
// answer plus the one they were last texted about. Fewer than two means
// there's no doubt. The one they were last texted about comes first (it's
// who people are nearly always answering), then the rest newest first. Each
// is labelled with the other person, the car and the start of their last
// message, so similar listings can't be mixed up:
// 'ADV AUTO Inc., 2026 Hyundai Palisade SEL: "Hi Dewey, I still have…"'.
async function replyChoices(admin: Admin, userId: string, lastId: string | null): Promise<{ id: string; label: string }[]> {
  const { data: convs } = await admin
    .from("conversations")
    .select("id, customer_id, broker_id, deal_label")
    .or(`broker_id.eq.${userId},customer_id.eq.${userId}`)
    .returns<{ id: string; customer_id: string; broker_id: string; deal_label: string | null }[]>();
  if (!convs?.length) return [];
  const { data: recent } = await admin
    .from("messages")
    .select("conversation_id, sender_id, created_at, body")
    .in("conversation_id", convs.map((c) => c.id))
    .gte("created_at", new Date(Date.now() - ACTIVE_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<{ conversation_id: string; sender_id: string; created_at: string; body: string }[]>();
  // Newest message per conversation decides whether it's waiting on them.
  const seen = new Set<string>();
  const waiting: string[] = [];
  const lastSaid = new Map<string, string>();
  for (const m of recent ?? []) {
    if (m.sender_id !== userId && !lastSaid.has(m.conversation_id)) lastSaid.set(m.conversation_id, m.body);
    if (seen.has(m.conversation_id)) continue;
    seen.add(m.conversation_id);
    if (m.sender_id !== userId) waiting.push(m.conversation_id);
  }
  const byId = new Map(convs.map((c) => [c.id, c]));
  const ids = [...new Set([...(lastId && byId.has(lastId) ? [lastId] : []), ...waiting])];
  if (ids.length < 2) return ids.map((id) => ({ id, label: "" }));
  const names = await participantNames(ids.map((id) => byId.get(id)!));
  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
  return ids.map((id) => {
    const c = byId.get(id)!;
    const who = c.broker_id === userId ? names.customers.get(c.customer_id) ?? "A shopper" : names.brokers.get(c.broker_id) ?? "The seller";
    const car = c.deal_label ? cut(c.deal_label, 40) : "";
    const said = lastSaid.get(id)?.replace(/\s+/g, " ").trim();
    return { id, label: `${car ? `${who}, ${car}` : who}${said ? `: "${cut(said, 45)}"` : ""}` };
  });
}

async function replyHoldOf(admin: Admin, userId: string): Promise<{ text: string; options: string[] } | null> {
  const { data } = await admin
    .from("sms_settings")
    .select("reply_hold, reply_hold_options, reply_hold_at")
    .eq("user_id", userId)
    .maybeSingle<{ reply_hold: string | null; reply_hold_options: string[] | null; reply_hold_at: string | null }>();
  if (!data?.reply_hold || !data.reply_hold_options?.length || !data.reply_hold_at) return null;
  if (Date.now() - new Date(data.reply_hold_at).getTime() > HOLD_MS) return null;
  return { text: data.reply_hold, options: data.reply_hold_options };
}

async function clearReplyHold(admin: Admin, userId: string) {
  await admin.from("sms_settings").update({ reply_hold: null, reply_hold_options: null, reply_hold_at: null }).eq("user_id", userId);
}
