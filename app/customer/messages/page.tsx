import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountHome } from "@/lib/account-home";
import { messagingRole } from "@/lib/messages";
import { InboxPage } from "@/components/messages/MessagePages";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function CustomerMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/customer/login?next=/customer/messages");
  if ((await messagingRole(supabase, user)) !== "customer") redirect(await accountHome(supabase, user));

  return (
    <InboxPage
      supabase={supabase}
      viewer="customer"
      userId={user.id}
      title="Messages"
      intro="Your conversations with dealers and brokers. Everything stays here for your records."
      emptyMessage="No messages yet. Use “Message seller” on any listing to ask a question or request a deal."
      backHref="/customer/dashboard"
      backLabel="My account"
    />
  );
}
