// Opens a message attachment (0043_message_attachments.sql): checks the
// viewer is in the conversation — row-level security on messages decides —
// or an admin, then redirects to a short-lived signed URL. ?m=<message id>&i=<index>
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { ATTACHMENT_BUCKET, type MessageAttachment } from "@/lib/message-attachments";

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

  const client = (await isAdminEmail(user.email)) ? createAdminClient() : supabase;
  const { data: message } = await client
    .from("messages")
    .select("conversation_id, attachments")
    .eq("id", messageId)
    .maybeSingle<{ conversation_id: string; attachments: MessageAttachment[] | null }>();
  const a = message?.attachments?.[index];
  // Only files in this conversation's own folder.
  if (!message || !a || !a.path.startsWith(`${message.conversation_id}/`)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await createAdminClient()
    .storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(a.path, SIGNED_SECONDS, download ? { download: a.name } : undefined);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
