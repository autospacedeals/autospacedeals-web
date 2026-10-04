import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { ConversationPage } from "@/components/messages/MessagePages";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

export default async function AdminConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/messages/${id}`);

  return (
    <ConversationPage
      supabase={createAdminClient()}
      viewer="admin"
      userId={null}
      conversationId={id}
      backHref="/admin/messages"
    />
  );
}
