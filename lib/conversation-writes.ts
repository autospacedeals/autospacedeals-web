// Writes shared by the messaging actions (app/messages/actions.ts) and the
// no-sign-up "text me a code" flow (app/messages/quick-actions.ts): start
// (or reopen) a shopper's conversation about a listing, and add a message
// that tells the other side. They use the caller's own Supabase session,
// so row-level security still decides what's allowed. SERVER-ONLY.
import { after } from "next/server";
import { alertAdminsFirstMessage } from "@/lib/admin-alerts";
import type { createClient } from "@/lib/supabase/server";
import { describeAttachments, type MessageAttachment } from "@/lib/message-attachments";
import { dealTitle } from "@/lib/deal-utils";
import { getPublishedDealsByIds } from "@/lib/supabase/deals";
import { currentVisitSource } from "@/lib/leads";
import { MESSAGE_COLUMNS, notifyOtherSide, type MessageRow } from "@/lib/messages";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Failure = { ok: false; error: string };

// The signed-in shopper's conversation about this listing (reopened if
// there already is one) with their message added.
export async function startConversation(
  supabase: Supabase,
  userId: string,
  dealId: string,
  body: string
): Promise<{ ok: true; conversationId: string } | Failure> {
  const found = await getPublishedDealsByIds([dealId]);
  const deal = found?.[0];
  if (!deal) return { ok: false, error: "This listing isn't available anymore." };
  if (!deal.brokerId) return { ok: false, error: "This seller can't be messaged on Drive yet." };

  // Reopen the conversation about this listing if there already is one.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", userId)
    .eq("broker_id", deal.brokerId)
    .eq("deal_id", deal.id)
    .maybeSingle<{ id: string }>();
  let conversationId = existing?.id ?? null;
  if (!conversationId) {
    // Credited to how the shopper found us: this visit's source, else the
    // one they signed up with.
    let source = await currentVisitSource();
    if (!source) {
      const { data: me } = await supabase
        .from("customers")
        .select("signup_source, signup_campaign")
        .eq("id", userId)
        .maybeSingle<{ signup_source: string | null; signup_campaign: string | null }>();
      if (me?.signup_source) source = { source: me.signup_source, campaign: me.signup_campaign };
    }
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        customer_id: userId,
        broker_id: deal.brokerId,
        deal_id: deal.id,
        deal_label: dealTitle(deal).slice(0, 200),
        source: source?.source ?? null,
        campaign: source?.campaign ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !created) {
      console.error("startConversation: insert failed:", error?.message);
      return { ok: false, error: "We couldn't start that conversation. Please try again." };
    }
    conversationId = created.id;
  }


  const sent = await insertMessage(supabase, conversationId, userId, "customer", body);
  if (!sent.ok) return sent;
  return { ok: true, conversationId };
}

export async function insertMessage(
  supabase: Supabase,
  conversationId: string,
  senderId: string,
  role: "customer" | "broker",
  body: string,
  attachments: MessageAttachment[] = []
): Promise<{ ok: true; message: MessageRow } | Failure> {
  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, sender_role: role, body, attachments })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  if (error || !message) {
    console.error("sendMessage: insert failed:", error?.message);
    return { ok: false, error: "We couldn't send that message. Please try again." };
  }

  // Tell the other side by email/text (best-effort; never fails the send).
  const sentFiles = describeAttachments(attachments);
  const it = attachments.length === 1 ? "it" : "them";
  const notice = [
    body,
    sentFiles && `[Sent ${sentFiles}. Open the conversation on Drive to see ${it}; for privacy, ${it} disappear${attachments.length === 1 ? "s" : ""} 15 minutes after you open ${it}.]`,
  ]
    .filter(Boolean)
    .join("\n\n");
  await notifyOtherSide(conversationId, role, notice);
  // A seller's first message ever: the admins check in (once per seller).
  if (role === "customer") after(() => alertAdminsFirstMessage(conversationId));
  return { ok: true, message };
}
