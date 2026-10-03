import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { ConversationPage } from "@/components/messages/MessagePages";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

export default async function AdminConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/broker/login");

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
