// Twilio posts every text sent to Drive's number here (configured on the
// Messaging Service → Integration → incoming messages webhook). A reply from
// someone with texts turned on goes into the conversation they were last
// texted about, as a message with channel 'sms', and the other side is
// notified as usual. STOP / START keep our setting in step with Twilio's
// own opt-out handling (Twilio sends the STOP/HELP replies itself).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidTwilioSignature, smsWebhookUrl } from "@/lib/twilio";
import { conversationPath, MESSAGE_MAX, notifyOtherSide } from "@/lib/messages";
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
  if (!settings.last_conversation_id) {
    return twiml(`Drive: We couldn't tell which conversation this is for. Reply on Drive: ${siteLink("/")}`);
  }

  const { data: c } = await admin
    .from("conversations")
    .select("id, customer_id, broker_id")
    .eq("id", settings.last_conversation_id)
    .maybeSingle<{ id: string; customer_id: string; broker_id: string }>();
  const role = c?.customer_id === settings.user_id ? "customer" : c?.broker_id === settings.user_id ? "broker" : null;
  if (!c || !role) {
    return twiml(`Drive: That conversation isn't available anymore. Open Drive: ${siteLink("/")}`);
  }

  const body = text.slice(0, MESSAGE_MAX);
  const { error } = await admin
    .from("messages")
    .insert({ conversation_id: c.id, sender_id: settings.user_id, sender_role: role, body, channel: "sms" });
  if (error) {
    console.error("Twilio webhook: message insert failed:", error.message);
    return twiml(`Drive: Your reply didn't go through. Please reply on Drive: ${siteLink(conversationPath(role, c.id))}`);
  }
  await notifyOtherSide(c.id, role, body);
  return twiml();
}
