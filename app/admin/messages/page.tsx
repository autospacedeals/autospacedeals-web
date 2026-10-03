import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { InboxPage } from "@/components/messages/MessagePages";

export const metadata: Metadata = { title: "All messages", robots: { index: false } };

// Every conversation on the site, read-only — the record of what shoppers
// and brokers have said to each other.
export default async function AdminMessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/broker/login");

  return (
    <InboxPage
      supabase={createAdminClient()}
      viewer="admin"
      userId={null}
      title="All messages"
      intro="Every conversation between shoppers and sellers, newest first. Read-only."
      emptyMessage="No conversations yet."
      backHref="/admin/submissions"
      backLabel="Submissions"
    />
  );
}
