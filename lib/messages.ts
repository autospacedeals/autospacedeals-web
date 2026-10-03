// On-site messaging between shoppers and brokers (supabase/migrations/
// 0024_messaging.sql). SERVER-ONLY: the email alerts read recipients'
// addresses and settings with the service role.
//
// Who's who: a "customer" is an account with a customers row, a "broker"
// one with a brokers row. Conversations are always shopper ↔ broker about
// one listing; Drive's admin can read every conversation but never posts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { emailLayoutHtml, emailLinkHtml, escapeHtml, isEmailConfigured, sendEmail, siteLink } from "@/lib/email";
import { isSmsConfigured, sendSms } from "@/lib/twilio";

export type MessageRole = "customer" | "broker";

export const MESSAGE_MAX = 4000;

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: MessageRole;
  body: string;
  channel: string;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  customer_id: string;
  broker_id: string;
  deal_id: string | null;
  deal_label: string;
  created_at: string;
  last_message_at: string;
  last_message_preview: string;
  last_sender_role: MessageRole | null;
  customer_last_read_at: string | null;
  broker_last_read_at: string | null;
  customer_notified_at: string | null;
  broker_notified_at: string | null;
}

export const CONVERSATION_COLUMNS =
  "id, customer_id, broker_id, deal_id, deal_label, created_at, last_message_at, last_message_preview, " +
  "last_sender_role, customer_last_read_at, broker_last_read_at, customer_notified_at, broker_notified_at";

export const MESSAGE_COLUMNS = "id, conversation_id, sender_id, sender_role, body, channel, created_at";

// Where each side reads a conversation.
export function conversationPath(role: MessageRole | "admin", id: string): string {
  if (role === "broker") return `/broker/dashboard/messages/${id}`;
  if (role === "admin") return `/admin/messages/${id}`;
  return `/customer/messages/${id}`;
}

export function isUnreadFor(role: MessageRole, c: ConversationRow): boolean {
  if (!c.last_sender_role || c.last_sender_role === role) return false;
  const readAt = role === "customer" ? c.customer_last_read_at : c.broker_last_read_at;
  return !readAt || readAt < c.last_message_at;
}

// The signed-in account's messaging role, from its own profile rows.
export async function messagingRole(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null }
): Promise<MessageRole | "admin" | null> {
  if (isAdminEmail(user.email)) return "admin";
  const [{ data: customer }, { data: broker }] = await Promise.all([
    supabase.from("customers").select("id").eq("id", user.id).maybeSingle(),
    supabase.from("brokers").select("id").eq("id", user.id).maybeSingle(),
  ]);
  if (broker) return "broker";
  if (customer) return "customer";
  return null;
}

// Display names for each side of some conversations, read with the service
// role (a broker can't read a shopper's profile under RLS, and vice versa
// for anything beyond the public broker columns).
export async function participantNames(
  conversations: Pick<ConversationRow, "customer_id" | "broker_id">[]
): Promise<{ customers: Map<string, string>; brokers: Map<string, string> }> {
  const customers = new Map<string, string>();
  const brokers = new Map<string, string>();
  if (conversations.length === 0) return { customers, brokers };
  const admin = createAdminClient();
  const customerIds = [...new Set(conversations.map((c) => c.customer_id))];
  const brokerIds = [...new Set(conversations.map((c) => c.broker_id))];
  const [cs, bs] = await Promise.all([
    admin.from("customers").select("id, first_name, last_name").in("id", customerIds),
    admin.from("brokers").select("id, business_name").in("id", brokerIds),
  ]);
  for (const c of (cs.data ?? []) as { id: string; first_name: string; last_name: string }[]) {
    // First name + last initial: enough for a broker to know who it is.
    customers.set(c.id, `${c.first_name} ${c.last_name ? `${c.last_name[0]}.` : ""}`.trim());
  }
  for (const b of (bs.data ?? []) as { id: string; business_name: string }[]) brokers.set(b.id, b.business_name);
  return { customers, brokers };
}

// Emails the other side about a new message, if they want message emails
// and haven't already been emailed about this conversation since they last
// read it (or in the last hour). Best-effort: failures are logged, never
// thrown — the message itself is already saved.
const RENOTIFY_MS = 60 * 60 * 1000;

export async function notifyRecipient(
  conversationId: string,
  recipientRole: MessageRole,
  senderName: string,
  body: string
): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: c } = await admin
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("id", conversationId)
      .maybeSingle<ConversationRow>();
    if (!c) return;

    const recipientId = recipientRole === "customer" ? c.customer_id : c.broker_id;
    const notifiedAt = recipientRole === "customer" ? c.customer_notified_at : c.broker_notified_at;
    const readAt = recipientRole === "customer" ? c.customer_last_read_at : c.broker_last_read_at;
    const caughtUp = !notifiedAt || (readAt != null && readAt >= notifiedAt);
    const stale = notifiedAt != null && Date.now() - new Date(notifiedAt).getTime() > RENOTIFY_MS;
    if (!caughtUp && !stale) return;

    const { data: prefs } = await admin
      .from(recipientRole === "customer" ? "customers" : "brokers")
      .select("message_emails")
      .eq("id", recipientId)
      .maybeSingle<{ message_emails: boolean }>();
    if (prefs && prefs.message_emails === false) return;

    const { data: auth } = await admin.auth.admin.getUserById(recipientId);
    const to = auth?.user?.email;
    if (!to) return;

    const link = siteLink(conversationPath(recipientRole, c.id));
    const about = c.deal_label ? ` about the ${c.deal_label}` : "";
    const quoted = body.length > 1500 ? `${body.slice(0, 1500)}…` : body;
    const settingsPath = recipientRole === "customer" ? "/customer/dashboard#messages" : "/broker/dashboard#messages";
    const html = emailLayoutHtml({
      preheader: `${senderName}: ${quoted.slice(0, 100)}`,
      heading: `New message from ${senderName}`,
      bodyHtml:
        `<p style="margin:0 0 12px 0;">${escapeHtml(senderName)} sent you a message${escapeHtml(about)}:</p>` +
        `<p style="margin:0 0 20px 0;padding:12px 14px;border-left:3px solid #2f7bff;background:#f4f6fa;white-space:pre-wrap;">${escapeHtml(quoted)}</p>` +
        `<p style="margin:0;">${emailLinkHtml(link, "Reply on Drive")}</p>`,
      footerHtml:
        `Replies to this email aren't delivered — reply on Drive so your conversation stays in one place. ` +
        `${emailLinkHtml(siteLink(settingsPath), "Turn off message emails")}`,
    });
    const text =
      `${senderName} sent you a message${about}:\n\n${quoted}\n\nReply on Drive: ${link}\n\n` +
      `Replies to this email aren't delivered. Turn off message emails: ${siteLink(settingsPath)}`;

    const sent = await sendEmail({
      to,
      subject: `New message from ${senderName}${c.deal_label ? ` — ${c.deal_label}` : ""}`,
      html,
      text,
    });
    if (!sent.ok) {
      console.error("Message email failed:", sent.error);
      return;
    }
    await admin
      .from("conversations")
      .update(recipientRole === "customer" ? { customer_notified_at: new Date().toISOString() } : { broker_notified_at: new Date().toISOString() })
      .eq("id", c.id);
  } catch (err) {
    console.error("notifyRecipient threw:", err);
  }
}

// Tells the other side about a new message — by email and/or text, per
// their settings. Used for messages sent on the site and for text replies.
// Never throws.
export async function notifyOtherSide(conversationId: string, senderRole: MessageRole, body: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: c } = await admin
      .from("conversations")
      .select("customer_id, broker_id")
      .eq("id", conversationId)
      .maybeSingle<{ customer_id: string; broker_id: string }>();
    if (!c) return;
    const names = await participantNames([c]);
    const senderName =
      senderRole === "customer"
        ? names.customers.get(c.customer_id) ?? "A shopper"
        : names.brokers.get(c.broker_id) ?? "The seller";
    const recipientRole: MessageRole = senderRole === "customer" ? "broker" : "customer";
    await Promise.all([
      notifyRecipient(conversationId, recipientRole, senderName, body),
      textRecipient(conversationId, recipientRole, senderName, body),
    ]);
  } catch (err) {
    console.error("notifyOtherSide threw:", err);
  }
}

// Texts a new message to the recipient if they've turned texts on (see
// supabase/migrations/0025_sms.sql). Every message is texted — it's a
// conversation — and the conversation is remembered so a text reply lands
// in it.
const SMS_SNIPPET = 280;

async function textRecipient(conversationId: string, recipientRole: MessageRole, senderName: string, body: string) {
  if (!isSmsConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: c } = await admin
      .from("conversations")
      .select("id, customer_id, broker_id, deal_label")
      .eq("id", conversationId)
      .maybeSingle<{ id: string; customer_id: string; broker_id: string; deal_label: string }>();
    if (!c) return;
    const recipientId = recipientRole === "customer" ? c.customer_id : c.broker_id;
    const { data: sms } = await admin
      .from("sms_settings")
      .select("phone, enabled, verified_at")
      .eq("user_id", recipientId)
      .maybeSingle<{ phone: string | null; enabled: boolean; verified_at: string | null }>();
    if (!sms?.enabled || !sms.phone || !sms.verified_at) return;

    const snippet = body.replace(/\s+/g, " ").trim();
    const quoted = snippet.length > SMS_SNIPPET ? `${snippet.slice(0, SMS_SNIPPET - 1)}…` : snippet;
    const about = c.deal_label ? ` about the ${c.deal_label}` : "";
    const text =
      `Drive · ${senderName}${about}: "${quoted}"\n\n` +
      `Reply to this text to answer, or open ${siteLink(conversationPath(recipientRole, c.id))}`;
    const sent = await sendSms(sms.phone, text);
    if (sent) {
      await admin
        .from("sms_settings")
        .update({ last_conversation_id: c.id, updated_at: new Date().toISOString() })
        .eq("user_id", recipientId);
    }
  } catch (err) {
    console.error("textRecipient threw:", err);
  }
}
