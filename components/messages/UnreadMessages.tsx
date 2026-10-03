"use client";

// The unread-messages count on the header's Messages links, kept live:
// recounted on load and on every page change (so reading a conversation
// clears it), and bumped as soon as a new message arrives (Supabase
// Realtime — row-level security only delivers the viewer's own
// conversations). Counts conversations with something unread, not messages.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = "customer" | "broker";

interface ConversationReadState {
  last_sender_role: Role | null;
  last_message_at: string;
  customer_last_read_at: string | null;
  broker_last_read_at: string | null;
}

function countUnread(role: Role, rows: ConversationReadState[]): number {
  return rows.filter((c) => {
    if (!c.last_sender_role || c.last_sender_role === role) return false;
    const readAt = role === "customer" ? c.customer_last_read_at : c.broker_last_read_at;
    return !readAt || readAt < c.last_message_at;
  }).length;
}

export function useUnreadMessages(role: Role | null): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);

  const recount = useCallback(async () => {
    if (!role) return;
    try {
      clientRef.current ??= createClient();
      const supabase = clientRef.current;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("conversations")
        .select("last_sender_role, last_message_at, customer_last_read_at, broker_last_read_at")
        .eq(role === "customer" ? "customer_id" : "broker_id", user.id)
        .limit(500)
        .returns<ConversationReadState[]>();
      if (!error) setCount(countUnread(role, data ?? []));
    } catch (err) {
      console.error("Unread messages count failed:", err);
    }
  }, [role]);

  // On load and after every navigation (opening a conversation marks it
  // read; give that a moment to land first).
  useEffect(() => {
    const t = setTimeout(recount, 600);
    return () => clearTimeout(t);
  }, [recount, pathname]);

  // A new message for this viewer: recount once the conversation's summary
  // row has been updated by the database.
  useEffect(() => {
    if (!role) return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = clientRef.current ??= createClient();
    } catch {
      return;
    }
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session) return;
      supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`unread:${role}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          if ((payload.new as { sender_role?: string }).sender_role !== role) setTimeout(recount, 800);
        })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [role, recount]);

  return count;
}

// A small count bubble for the corner of a Messages icon or button.
export function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-[18px] font-semibold text-white ${className}`}
    >
      {count > 9 ? "9+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}
