// Deleting message attachments once they've disappeared (see
// VIEW_WINDOW_MS in lib/message-attachments.ts): the file comes out of
// storage and the attachment is marked deleted, keeping its name and kind
// so the conversation still shows that something was sent. Used by
// /api/messages/attachment (on the spot) and /api/cron/expire-attachments.
// SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";
import { ATTACHMENT_BUCKET, isAttachmentGone, type MessageAttachment } from "@/lib/message-attachments";

export interface AttachmentMessage {
  id: string;
  created_at: string;
  attachments: MessageAttachment[] | null;
}

// Deletes this message's attachments that are past their time. Returns
// the updated list (unchanged if nothing was due).
export async function expireMessageAttachments(m: AttachmentMessage, now = Date.now()): Promise<MessageAttachment[]> {
  const list = m.attachments ?? [];
  const due = list.filter((a) => !a.deletedAt && isAttachmentGone(a, m.created_at, now));
  if (due.length === 0) return list;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(ATTACHMENT_BUCKET).remove(due.map((a) => a.path));
  if (error) {
    console.error("expireMessageAttachments: storage remove failed:", error.message);
    return list;
  }
  const deletedAt = new Date(now).toISOString();
  const next = list.map((a) => (due.includes(a) ? { ...a, deletedAt } : a));
  const { error: updateError } = await admin.from("messages").update({ attachments: next }).eq("id", m.id);
  if (updateError) console.error("expireMessageAttachments: update failed:", updateError.message);
  return next;
}
