import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountHome } from "@/lib/account-home";
import { messagingRole } from "@/lib/messages";
import { InboxPage } from "@/components/messages/MessagePages";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default async function BrokerMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");
  if ((await messagingRole(supabase, user)) !== "broker") redirect(await accountHome(supabase, user));

  return (
    <InboxPage
      supabase={supabase}
      viewer="broker"
      userId={user.id}
      title="Messages"
      intro="Shoppers who've messaged you about your listings. Reply here — conversations are kept on Drive."
      emptyMessage="No messages yet. When a shopper uses “Message seller” on one of your listings, it shows up here."
      backHref="/broker/dashboard"
      backLabel="Dashboard"
    />
  );
}
