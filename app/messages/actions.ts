"use server";

// Messaging actions (see lib/messages.ts): a shopper starts a conversation
// from a listing, either side replies, and each side can turn message
// emails on or off. Writes go through the user's own session, so the
// database's row-level security decides what's allowed (0024_messaging.sql).
import { randomUUID } from "crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { alertAdminsFirstMessage } from "@/lib/admin-alerts";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  SHAREABLE_DOCS,
  cleanAttachments,
  describeAttachments,
  safeFileName,
  type MessageAttachment,
  type ShareableDoc,
} from "@/lib/message-attachments";
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

// The signed-in user and their side of a conversation, or why not.
async function participant(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: { ok: false, code: "signed-out", error: "Your session ended — log in again to reply." } as Failure };
  const { data: c } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", String(conversationId))
    .maybeSingle<ConversationRow>();
  const role = c?.customer_id === user.id ? "customer" : c?.broker_id === user.id ? "broker" : null;
  if (!c || !role) return { error: { ok: false, error: "That conversation wasn't found." } as Failure };
  return { supabase, user, c, role: role as "customer" | "broker" };
}

export async function sendMessageAction(input: {
  conversationId: string;
  body: string;
  attachments?: MessageAttachment[];
}): Promise<{ ok: true; message: MessageRow } | Failure> {
  const p = await participant(input.conversationId);
  if ("error" in p) return p.error!;
  const { supabase, user, c, role } = p;

  const attachments = cleanAttachments(input.attachments, c.id);
  if (!attachments) return { ok: false, error: "Those files couldn't be attached. Please try again." };
  const body = attachments.length ? String(input.body ?? "").replace(/\r\n/g, "\n").trim() : cleanBody(input.body);
  if (body == null || body.length > MESSAGE_MAX) return { ok: false, error: BODY_ERROR };
  if (attachments.length && !(await uploadsExist(attachments))) {
    return { ok: false, error: "A file didn't finish uploading. Please attach it again." };
  }

  const sent = await insertMessage(supabase, c.id, user.id, role, body, attachments);
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
  const notice = [body, sentFiles && `[Sent ${sentFiles}. Open the conversation on Drive to see ${attachments.length === 1 ? "it" : "them"}.]`]
    .filter(Boolean)
    .join("\n\n");
  await notifyOtherSide(conversationId, role, notice);
  // A seller's first message ever: the admins check in (once per seller).
  if (role === "customer") after(() => alertAdminsFirstMessage(conversationId));
  return { ok: true, message };
}

// Every attachment was really uploaded to its folder.
async function uploadsExist(attachments: MessageAttachment[]): Promise<boolean> {
  const storage = createAdminClient().storage.from(ATTACHMENT_BUCKET);
  const checks = await Promise.all(
    attachments.map(async (a) => {
      const folder = a.path.slice(0, a.path.lastIndexOf("/"));
      const file = a.path.slice(a.path.lastIndexOf("/") + 1);
      const { data } = await storage.list(folder, { search: file, limit: 5 });
      return (data ?? []).some((f) => f.name === file);
    })
  );
  return checks.every(Boolean);
}

// Signed upload URLs for files about to be attached: the browser uploads
// straight to storage (big phone photos don't pass through the server),
// then sends the message with their paths.
export async function prepareAttachmentUploadsAction(input: {
  conversationId: string;
  files: { name: string; type: string; size: number }[];
}): Promise<{ ok: true; uploads: { path: string; token: string }[] } | Failure> {
  const p = await participant(input.conversationId);
  if ("error" in p) return p.error!;
  const files = Array.isArray(input.files) ? input.files : [];
  if (files.length === 0 || files.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Attach up to ${MAX_ATTACHMENTS} files at a time.` };
  }
  for (const f of files) {
    if (!ATTACHMENT_TYPES.includes(f?.type)) return { ok: false, error: "Only photos and PDFs can be attached." };
    if (!(f.size > 0) || f.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: `Each file must be under ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.` };
    }
  }
  const storage = createAdminClient().storage.from(ATTACHMENT_BUCKET);
  const uploads: { path: string; token: string }[] = [];
  for (const f of files) {
    const path = `${p.c.id}/${randomUUID()}/${safeFileName(f.name)}`;
    const { data, error } = await storage.createSignedUploadUrl(path);
    if (error || !data) {
      console.error("prepareAttachmentUploads failed:", error?.message);
      return { ok: false, error: "Attachments aren't available right now. Please try again." };
    }
    uploads.push({ path, token: data.token });
  }
  return { ok: true, uploads };
}

// A shopper sends the seller documents from their account (driver's
// license, insurance card): copied into the conversation, so the seller's
// copy stays as sent.
export async function shareDocumentsAction(input: {
  conversationId: string;
  docs: ShareableDoc[];
}): Promise<{ ok: true; message: MessageRow } | Failure> {
  const p = await participant(input.conversationId);
  if ("error" in p) return p.error!;
  const { supabase, user, c, role } = p;
  if (role !== "customer") return { ok: false, error: "Only shoppers can share their documents." };
  const docs = [...new Set((input.docs ?? []).filter((d): d is ShareableDoc => d in SHAREABLE_DOCS))];
  if (docs.length === 0) return { ok: false, error: "Pick a document to share." };

  const { data: profile } = await supabase
    .from("customers")
    .select("drivers_license_path, insurance_card_path")
    .eq("id", user.id)
    .maybeSingle<{ drivers_license_path: string | null; insurance_card_path: string | null }>();
  const admin = createAdminClient();
  const attachments: MessageAttachment[] = [];
  for (const doc of docs) {
    const source = doc === "license" ? profile?.drivers_license_path : profile?.insurance_card_path;
    if (!source) return { ok: false, error: `Add your ${SHAREABLE_DOCS[doc].label.toLowerCase()} on your account page first.` };
    const { data: file, error } = await admin.storage.from("customer-uploads").download(source);
    if (error || !file) {
      console.error("shareDocuments: download failed:", error?.message);
      return { ok: false, error: "We couldn't get that document. Please try again." };
    }
    const type = file.type && ATTACHMENT_TYPES.includes(file.type) ? file.type : guessType(source);
    if (!type) return { ok: false, error: `Your ${SHAREABLE_DOCS[doc].label.toLowerCase()} is in a format we can't send. Upload it again as a photo or PDF.` };
    const ext = source.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${c.id}/${randomUUID()}/${SHAREABLE_DOCS[doc].file}.${ext}`;
    const { error: upError } = await admin.storage.from(ATTACHMENT_BUCKET).upload(path, file, { contentType: type });
    if (upError) {
      console.error("shareDocuments: upload failed:", upError.message);
      return { ok: false, error: "We couldn't share that document. Please try again." };
    }
    attachments.push({ path, name: `${SHAREABLE_DOCS[doc].file}.${ext}`, type, size: file.size, kind: doc });
  }
  const body = `Here's my ${docs.map((d) => SHAREABLE_DOCS[d].label.toLowerCase()).join(" and ")}.`;
  const sent = await insertMessage(supabase, c.id, user.id, role, body, attachments);
  if (sent.ok) revalidatePath("/customer/messages");
  return sent;
}

function guessType(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    gif: "image/gif",
    pdf: "application/pdf",
  };
  return (ext && map[ext]) || null;
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
