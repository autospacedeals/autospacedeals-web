// Server-rendered inbox and conversation pages, shared by the shopper
// (/customer/messages), broker (/broker/dashboard/messages) and admin
// (/admin/messages) routes — each route checks who's signed in and passes
// the right client: the user's own (row-level security limits it to their
// conversations) or, for admin, the service role.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ExternalLink } from "lucide-react";
import ConversationList, { type ConversationListItem } from "@/components/messages/ConversationList";
import MessageThread from "@/components/messages/MessageThread";
import {
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  conversationPath,
  isUnreadFor,
  participantNames,
  type ConversationRow,
  type MessageRole,
  type MessageRow,
} from "@/lib/messages";

type Viewer = MessageRole | "admin";

const INBOX_LIMIT = 200;
const THREAD_LIMIT = 1000;

export async function InboxPage({
  supabase,
  viewer,
  userId,
  title,
  intro,
  emptyMessage,
  backHref,
  backLabel,
  filterAccountId = null,
}: {
  supabase: SupabaseClient;
  viewer: Viewer;
  userId: string | null; // null for admin (everything)
  title: string;
  intro: string;
  emptyMessage: string;
  backHref: string;
  backLabel: string;
  // Admin only: just this account's conversations (either side).
  filterAccountId?: string | null;
}) {
  let query = supabase.from("conversations").select(CONVERSATION_COLUMNS);
  if (viewer === "customer" && userId) query = query.eq("customer_id", userId);
  if (viewer === "broker" && userId) query = query.eq("broker_id", userId);
  if (viewer === "admin" && filterAccountId && /^[0-9a-f-]{36}$/i.test(filterAccountId)) {
    query = query.or(`customer_id.eq.${filterAccountId},broker_id.eq.${filterAccountId}`);
  }
  const { data, error } = await query
    .order("last_message_at", { ascending: false })
    .limit(INBOX_LIMIT)
    .returns<ConversationRow[]>();
  if (error) console.error("InboxPage: conversations failed:", error.message);
  const conversations = data ?? [];
  const names = await participantNames(conversations);

  const items: ConversationListItem[] = conversations.map((c) => {
    const customer = names.customers.get(c.customer_id) ?? "Shopper";
    const broker = names.brokers.get(c.broker_id) ?? "Seller";
    return {
      id: c.id,
      href: conversationPath(viewer, c.id),
      title: viewer === "customer" ? broker : viewer === "broker" ? customer : `${customer} ↔ ${broker}`,
      dealLabel: c.deal_label,
      preview: `${c.last_sender_role && c.last_sender_role === viewer ? "You: " : ""}${c.last_message_preview}`,
      lastMessageAt: c.last_message_at,
      unread: viewer !== "admin" && isUnreadFor(viewer, c),
    };
  });

  return (
    <main className="container-page max-w-3xl py-8 sm:py-12">
      <Link href={backHref} className="link-arrow mb-6 min-h-9">
        <ArrowLeft /> {backLabel}
      </Link>
      <h1 className="type-page text-3xl sm:text-4xl">{title}</h1>
      <p className="mt-2 mb-6 text-sm text-fg-muted">{intro}</p>
      {error ? (
        <p className="alert alert-danger">We couldn&apos;t load your messages right now. Please try again in a minute.</p>
      ) : (
        <ConversationList items={items} emptyMessage={emptyMessage} />
      )}
    </main>
  );
}

export async function ConversationPage({
  supabase,
  viewer,
  userId,
  conversationId,
  backHref,
}: {
  supabase: SupabaseClient;
  viewer: Viewer;
  userId: string | null;
  conversationId: string;
  backHref: string;
}) {
  const { data: c } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();
  if (!c) notFound();
  if (viewer === "customer" && c.customer_id !== userId) notFound();
  if (viewer === "broker" && c.broker_id !== userId) notFound();

  const [{ data: messages }, names, { data: deal }] = await Promise.all([
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", c.id)
      .order("created_at", { ascending: true })
      .limit(THREAD_LIMIT)
      .returns<MessageRow[]>(),
    participantNames([c]),
    c.deal_id
      ? supabase.from("deals").select("slug, status").eq("id", c.deal_id).maybeSingle<{ slug: string; status: string }>()
      : Promise.resolve({ data: null }),
  ]);
  const customer = names.customers.get(c.customer_id) ?? "Shopper";
  const broker = names.brokers.get(c.broker_id) ?? "Seller";
  const other = viewer === "customer" ? broker : viewer === "broker" ? customer : `${customer} ↔ ${broker}`;

  return (
    <main className="container-page max-w-3xl py-8 sm:py-12">
      <Link href={backHref} className="link-arrow mb-6 min-h-9">
        <ArrowLeft /> All messages
      </Link>
      <div className="panel">
        <div className="border-b border-line pb-4">
          <h1 className="type-title">{other}</h1>
          {c.deal_label && (
            <p className="mt-1 text-sm text-fg-muted">
              About the {c.deal_label}
              {deal?.status === "published" && (
                <>
                  {" · "}
                  <Link href={`/deals/${deal.slug}`} className="link inline-flex items-center gap-1">
                    View listing <ExternalLink size={13} />
                  </Link>
                </>
              )}
            </p>
          )}
        </div>
        <div className="pt-5">
          <MessageThread
            conversationId={c.id}
            viewerRole={viewer}
            names={{ customer, broker }}
            initialMessages={messages ?? []}
          />
        </div>
      </div>
    </main>
  );
}
