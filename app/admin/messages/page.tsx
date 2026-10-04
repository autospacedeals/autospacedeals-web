import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { InboxPage } from "@/components/messages/MessagePages";

export const metadata: Metadata = { title: "All messages", robots: { index: false } };

// Every conversation on the site, read-only — the record of what shoppers
// and brokers have said to each other. ?account=<id> narrows it to one
// shopper's or broker's conversations (linked from /admin/users).
export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  await requireAdmin("/admin/messages");
  const { account } = await searchParams;
  const accountId = typeof account === "string" ? account : null;

  return (
    <InboxPage
      supabase={createAdminClient()}
      viewer="admin"
      userId={null}
      filterAccountId={accountId}
      title={accountId ? "Messages for one account" : "All messages"}
      intro={
        accountId
          ? "This account's conversations, newest first. Read-only."
          : "Every conversation between shoppers and sellers, newest first. Read-only."
      }
      emptyMessage="No conversations yet."
      backHref={accountId ? "/admin/users" : "/admin"}
      backLabel={accountId ? "Users" : "Admin"}
    />
  );
}
