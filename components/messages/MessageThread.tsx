"use client";

// One conversation: the messages so far, new ones live (Supabase Realtime,
// which only delivers rows this viewer may read), and a reply box. Marks
// the conversation read for the viewer when it opens and as replies arrive.
// The admin view is read-only (no reply box, never marks anything read).
import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendMessageAction } from "@/app/messages/actions";
import type { MessageRow } from "@/lib/messages";

type ViewerRole = "customer" | "broker" | "admin";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MessageThread({
  conversationId,
  viewerRole,
  names,
  initialMessages,
}: {
  conversationId: string;
  viewerRole: ViewerRole;
  // Display names per side, e.g. { customer: "Jordan S.", broker: "Pyramid Auto" }.
  names: { customer: string; broker: string };
  initialMessages: MessageRow[];
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const readOnly = viewerRole === "admin";

  // Live updates + read receipts.
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (err) {
      console.error("MessageThread: no Supabase client:", err);
      return;
    }
    const markRead = () => {
      if (readOnly) return;
      supabase.rpc("mark_conversation_read", { conversation: conversationId }).then(({ error: rpcError }) => {
        if (rpcError) console.error("mark_conversation_read failed:", rpcError.message);
      });
    };
    markRead();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_role !== viewerRole) markRead();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, viewerRole, readOnly]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendMessageAction({ conversationId, body });
        if (result.ok) {
          setDraft("");
          setMessages((prev) => (prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message]));
        } else {
          setError(result.error);
        }
      } catch (err) {
        console.error("sendMessageAction threw:", err);
        setError("We couldn't send that message. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col">
      <ol className="space-y-3" aria-label="Messages">
        {messages.length === 0 && <li className="text-sm text-fg-muted">No messages yet.</li>}
        {messages.map((m) => {
          const mine = !readOnly && m.sender_role === viewerRole;
          // In the admin view, the shopper is on the left and the seller on the right.
          const right = readOnly ? m.sender_role === "broker" : mine;
          return (
            <li key={m.id} className={`flex ${right ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] sm:max-w-[70%] ${right ? "text-right" : ""}`}>
                <p className="mb-1 text-[11px] text-fg-muted">
                  {mine ? "You" : names[m.sender_role]} · {timeLabel(m.created_at)}
                </p>
                <p
                  className={`inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 break-words whitespace-pre-wrap ${
                    right ? "bg-accent text-white" : "border border-line bg-raised text-fg"
                  }`}
                >
                  {m.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={endRef} />

      {readOnly ? (
        <p className="mt-6 text-xs text-fg-muted">Read-only admin view.</p>
      ) : (
        <form onSubmit={send} className="mt-6 border-t border-line pt-4">
          <label htmlFor={`reply-${conversationId}`} className="sr-only">
            Reply
          </label>
          <textarea
            id={`reply-${conversationId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // ⌘/Ctrl+Enter sends; plain Enter is a new line.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
            }}
            rows={3}
            maxLength={4000}
            placeholder={`Message ${viewerRole === "customer" ? names.broker : names.customer}…`}
            className="textarea resize-y"
          />
          <div role="alert">{error && <p className="alert alert-danger mt-3">{error}</p>}</div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-fg-muted">Messages are kept on Drive for your records.</p>
            <button type="submit" disabled={pending || !draft.trim()} className="btn btn-primary">
              <Send /> {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
