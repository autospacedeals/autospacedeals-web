// Opens a message attachment (0043_message_attachments.sql): checks the
// viewer is in the conversation — row-level security on messages decides —
// or an admin, then redirects to a short-lived signed URL. ?m=<message id>&i=<index>
//
// Files disappear for privacy (lib/message-attachments.ts): the first time
// the person it was sent to opens it starts its 15 minutes; once its time
// is up it's deleted here if the cleanup job hasn't got to it yet, and
// isn't served (410).
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { ATTACHMENT_BUCKET, isAttachmentGone, type MessageAttachment } from "@/lib/message-attachments";
import { expireMessageAttachments } from "@/lib/attachment-expiry";

const SIGNED_SECONDS = 300;

export async function GET(request: NextRequest) {
  const messageId = request.nextUrl.searchParams.get("m") ?? "";
  const index = Number(request.nextUrl.searchParams.get("i"));
  if (!/^[0-9a-f-]{36}$/i.test(messageId) || !Number.isInteger(index) || index < 0) {
    return new NextResponse("Not found", { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Log in to view this file.", { status: 401 });

  const isAdmin = await isAdminEmail(user.email);
  const { data: message } = await (isAdmin ? createAdminClient() : supabase)
    .from("messages")
    .select("id, conversation_id, sender_id, created_at, attachments")
    .eq("id", messageId)
    .maybeSingle<{ id: string; conversation_id: string; sender_id: string; created_at: string; attachments: MessageAttachment[] | null }>();
  const a = message?.attachments?.[index];
  // Only files in this conversation's own folder.
  if (!message || !a || !a.path.startsWith(`${message.conversation_id}/`)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const noStore = { "Cache-Control": "private, no-store" };
  if (isAttachmentGone(a, message.created_at)) {
    if (!a.deletedAt) await expireMessageAttachments(message);
    return new NextResponse("This file was deleted for privacy.", { status: 410, headers: noStore });
  }

  // The person it was sent to opening it starts the countdown.
  if (!a.openedAt && !isAdmin && user.id !== message.sender_id) {
    const openedAt = new Date().toISOString();
    const next = message.attachments!.map((x, i) => (i === index ? { ...x, openedAt } : x));
    const { error } = await createAdminClient().from("messages").update({ attachments: next }).eq("id", message.id);
    if (error) console.error("attachment open: update failed:", error.message);
  }

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await createAdminClient()
    .storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(a.path, SIGNED_SECONDS, download ? { download: a.name } : undefined);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: noStore });
}
