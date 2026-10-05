"use server";

// Messaging actions (see lib/messages.ts): a shopper starts a conversation
// from a listing, either side replies, and each side can turn message
// emails on or off. Writes go through the user's own session, so the
// database's row-level security decides what's allowed (0024_messaging.sql).
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dealTitle } from "@/lib/deal-utils";
import { getPublishedDealsByIds } from "@/lib/supabase/deals";
import { OUTCOMES_ENABLED, currentVisitSource, isLeadOutcome, saveConversationOutcome } from "@/lib/leads";
import {
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  MESSAGE_MAX,
  messagingRole,
  notifyOtherSide,
  type ConversationRow,
  type MessageRow,
} from "@/lib/messages";

type Failure = { ok: false; error: string; code?: "signed-out" | "not-customer" };

function cleanBody(raw: unknown): string | null {
  const body = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  return body && body.length <= MESSAGE_MAX ? body : null;
}

const BODY_ERROR = `Write a message (up to ${MESSAGE_MAX.toLocaleString("en-US")} characters).`;

export async function startConversationAction(input: {
  dealId: string;
  body: string;
}): Promise<{ ok: true; conversationId: string } | Failure> {
  const body = cleanBody(input.body);
  if (!body) return { ok: false, error: BODY_ERROR };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "signed-out", error: "Log in with your shopper account to message sellers." };
  const role = await messagingRole(supabase, user);
  if (role !== "customer") {
    return { ok: false, code: "not-customer", error: "Messaging sellers needs a shopper account." };
  }

  const found = await getPublishedDealsByIds([String(input.dealId)]);
  const deal = found?.[0];
  if (!deal) return { ok: false, error: "This listing isn't available anymore." };
  if (!deal.brokerId) return { ok: false, error: "This seller can't be messaged on Drive yet." };

  // Reopen the conversation about this listing if there already is one.
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("customer_id", user.id)
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
        .eq("id", user.id)
        .maybeSingle<{ signup_source: string | null; signup_campaign: string | null }>();
      if (me?.signup_source) source = { source: me.signup_source, campaign: me.signup_campaign };
    }
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({
        customer_id: user.id,
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

  const sent = await insertMessage(supabase, conversationId, user.id, "customer", body);
  if (!sent.ok) return sent;
  revalidatePath("/customer/messages");
  return { ok: true, conversationId };
}

export async function sendMessageAction(input: {
  conversationId: string;
  body: string;
}): Promise<{ ok: true; message: MessageRow } | Failure> {
  const body = cleanBody(input.body);
  if (!body) return { ok: false, error: BODY_ERROR };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "signed-out", error: "Your session ended — log in again to reply." };

  const { data: c } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", String(input.conversationId))
    .maybeSingle<ConversationRow>();
  if (!c) return { ok: false, error: "That conversation wasn't found." };
  const role = c.customer_id === user.id ? "customer" : c.broker_id === user.id ? "broker" : null;
  if (!role) return { ok: false, error: "That conversation wasn't found." };

  const sent = await insertMessage(supabase, c.id, user.id, role, body);
  if (sent.ok) {
    revalidatePath(role === "customer" ? "/customer/messages" : "/broker/dashboard/messages");
  }
  return sent;
}

async function insertMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  senderId: string,
  role: "customer" | "broker",
  body: string
): Promise<{ ok: true; message: MessageRow } | Failure> {
  const { data: message, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, sender_role: role, body })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  if (error || !message) {
    console.error("sendMessage: insert failed:", error?.message);
    return { ok: false, error: "We couldn't send that message. Please try again." };
  }

  // Tell the other side by email/text (best-effort; never fails the send).
  await notifyOtherSide(conversationId, role, body);
  return { ok: true, message };
}

// "Email me when I get a new message", for either side.
export async function setMessageEmailsAction(enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in again to change this." };
  const role = await messagingRole(supabase, user);
  if (role !== "customer" && role !== "broker") return { error: "This account doesn't have messages." };

  const { error } = await supabase
    .from(role === "customer" ? "customers" : "brokers")
    .update({ message_emails: enabled === true })
    .eq("id", user.id);
  if (error) {
    console.error("setMessageEmails failed:", error.message);
    return { error: "Couldn't save that — please try again." };
  }
  revalidatePath(role === "customer" ? "/customer/dashboard" : "/broker/dashboard");
  return { error: null };
}

// "Did this one sell?" — the broker in the conversation (or an admin) marks
// it sold, still working, or didn't buy, for the admin Leads page.
export async function setConversationOutcomeAction(input: {
  conversationId: string;
  outcome: string;
}): Promise<{ error: string | null }> {
  if (!OUTCOMES_ENABLED) return { error: "This isn't available yet." };
  if (!isLeadOutcome(input.outcome)) return { error: "Pick one of the options." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session ended — log in again." };

  const role = await messagingRole(supabase, user);
  if (role !== "broker" && role !== "admin") return { error: "Only the seller can mark this." };
  if (role === "broker") {
    // Row-level security only shows a broker their own conversations.
    const { data: c } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", String(input.conversationId))
      .eq("broker_id", user.id)
      .maybeSingle();
    if (!c) return { error: "That conversation wasn't found." };
  }

  if (!(await saveConversationOutcome(String(input.conversationId), input.outcome))) {
    return { error: "Couldn't save that — please try again." };
  }
  revalidatePath("/broker/dashboard/messages");
  revalidatePath("/admin/leads");
  return { error: null };
}
