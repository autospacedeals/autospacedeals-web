// Deletes message attachments whose time is up (lib/message-attachments.ts:
// 15 minutes after the recipient first opens them, or a week after sending).
// Run every few minutes by pg_cron (0046), same CRON_SYNC_SECRET as the
// other jobs.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { UNOPENED_TTL_MS, isAttachmentGone, type MessageAttachment } from "@/lib/message-attachments";
import { expireMessageAttachments } from "@/lib/attachment-expiry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SYNC_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = Date.now();
  // Anything that can still be live was sent within the last week; a wide
  // margin so a stretch of missed runs still gets caught up.
  const since = new Date(now - UNOPENED_TTL_MS - 23 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from("messages")
    .select("id, created_at, attachments")
    .gte("created_at", since)
    .neq("attachments", "[]")
    .limit(2000)
    .returns<{ id: string; created_at: string; attachments: MessageAttachment[] }[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let deleted = 0;
  for (const m of data ?? []) {
    const due = m.attachments.filter((a) => !a.deletedAt && isAttachmentGone(a, m.created_at, now)).length;
    if (!due) continue;
    const after = await expireMessageAttachments(m, now);
    deleted += after.filter((a) => a.deletedAt).length - m.attachments.filter((a) => a.deletedAt).length;
  }
  return NextResponse.json({ checked: data?.length ?? 0, deleted });
}
