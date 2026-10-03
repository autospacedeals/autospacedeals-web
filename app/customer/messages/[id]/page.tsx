import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConversationPage } from "@/components/messages/MessagePages";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

export default async function CustomerConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/customer/login?next=${encodeURIComponent(`/customer/messages/${id}`)}`);

  return (
    <ConversationPage supabase={supabase} viewer="customer" userId={user.id} conversationId={id} backHref="/customer/messages" />
  );
}
