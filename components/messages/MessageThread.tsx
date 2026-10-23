"use client";

// One conversation: the messages so far, new ones live (Supabase Realtime,
// which only delivers rows this viewer may read), and a reply box. Marks
// the conversation read for the viewer when it opens and as replies arrive.
// The admin view is read-only (no reply box, never marks anything read).
// Either side can attach photos and PDFs (uploaded straight to private
// storage, see lib/message-attachments.ts); a shopper can also share the
// documents on their account.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileText, FileX, IdCard, ImageOff, Paperclip, Send, Timer, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareAttachmentUploadsAction, sendMessageAction, shareDocumentsAction } from "@/app/messages/actions";
import type { MessageRow } from "@/lib/messages";
import { shrinkImage } from "@/lib/shrink-image";
import TextRepliesPrompt from "@/components/messages/TextRepliesPrompt";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_BUCKET,
  ATTACHMENT_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  SHAREABLE_DOCS,
  attachmentExpiresAt,
  attachmentLabel,
  isAttachmentGone,
  isDisplayableImage,
  isImageType,
  type MessageAttachment,
  type ShareableDoc,
} from "@/lib/message-attachments";
import LocalTime from "@/components/LocalTime";

type ViewerRole = "customer" | "broker" | "admin";

const attachmentUrl = (messageId: string, index: number, download = false) =>
  `/api/messages/attachment?m=${messageId}&i=${index}${download ? "&download=1" : ""}`;

function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

// A file's status line: how long until it disappears, or that it hasn't
// been opened yet (the 15 minutes start then).
function TimerLine({
  expiresAt,
  opened,
  mine,
  admin,
  otherName,
  now,
  align,
}: {
  expiresAt: number;
  opened: boolean;
  mine: boolean;
  admin: boolean;
  otherName: string;
  now: number;
  align: string;
}) {
  let text: string;
  if (opened) text = `Disappears in ${countdown(expiresAt - now)}`;
  else if (admin) text = "Not opened yet";
  else if (mine) text = `Disappears 15 min after ${otherName} opens it`;
  else text = "Disappears 15 min after you open it";
  return (
    // The countdown differs by a second or two between server and browser.
    <span suppressHydrationWarning className={`mt-1 flex items-center gap-1 text-[11px] text-fg-muted ${align}`}>
      <Timer className="size-3" /> {text}
    </span>
  );
}

function Attachments({
  message,
  onAccent,
  viewerRole,
  otherName,
  now,
  localOpened,
  onOpened,
}: {
  message: MessageRow;
  onAccent: boolean;
  viewerRole: ViewerRole;
  otherName: string;
  now: number;
  // Files this viewer just opened, before the server's openedAt arrives.
  localOpened: Record<string, string>;
  onOpened: (key: string) => void;
}) {
  const list = message.attachments ?? [];
  if (list.length === 0) return null;
  const mine = viewerRole !== "admin" && message.sender_role === viewerRole;
  const recipient = viewerRole !== "admin" && !mine;
  const align = onAccent ? "justify-end" : "";
  return (
    <div className={`mt-1.5 flex flex-wrap gap-2 ${align}`}>
      {list.map((a, i) => {
        const key = `${message.id}:${i}`;
        const openedAt = a.openedAt ?? localOpened[key] ?? null;
        const gone = isAttachmentGone({ ...a, openedAt }, message.created_at, now);
        if (gone) {
          return (
            <span
              key={a.path}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-fg-muted"
            >
              {isImageType(a.type) ? <ImageOff className="size-3.5" /> : <FileX className="size-3.5" />}
              {a.kind === "license" || a.kind === "insurance" ? attachmentLabel(a) : isImageType(a.type) ? "Photo" : "File"} deleted
              for privacy
            </span>
          );
        }
        const timer = (
          <TimerLine
            expiresAt={attachmentExpiresAt({ openedAt }, message.created_at)}
            opened={Boolean(openedAt)}
            mine={mine}
            admin={viewerRole === "admin"}
            otherName={otherName}
            now={now}
            align={align}
          />
        );
        const label = (a.kind === "license" || a.kind === "insurance") && (
          <span className={`mt-1 block text-[11px] text-fg-muted ${onAccent ? "text-right" : "text-left"}`}>{attachmentLabel(a)}</span>
        );
        return isDisplayableImage(a.type) ? (
          <div key={a.path}>
            <a href={attachmentUrl(message.id, i)} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachmentUrl(message.id, i)}
                alt={attachmentLabel(a)}
                className="max-h-56 max-w-[240px] rounded-xl border border-line object-cover"
                // Showing it to the person it was sent to is opening it.
                onLoad={() => recipient && !openedAt && onOpened(key)}
              />
            </a>
            {label}
            {timer}
          </div>
        ) : (
          <div key={a.path}>
            <a
              href={attachmentUrl(message.id, i, isImageType(a.type))}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => recipient && !openedAt && onOpened(key)}
              className="inline-flex max-w-[240px] items-center gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-left text-sm text-fg hover:border-line-strong"
            >
              <FileText className="size-4 shrink-0 text-fg-muted" />
              <span className="truncate">{attachmentLabel(a)}</span>
            </a>
            {timer}
          </div>
        );
      })}
    </div>
  );
}

export default function MessageThread({
  conversationId,
  viewerRole,
  names,
  initialMessages,
  initialDraft = "",
  shareableDocs = [],
  textPrompt = null,
}: {
  conversationId: string;
  viewerRole: ViewerRole;
  // Display names per side, e.g. { customer: "Jordan S.", broker: "Pyramid Auto" }.
  names: { customer: string; broker: string };
  initialMessages: MessageRow[];
  // Starting text for the reply box (e.g. the total price in a seller's
  // first reply, see lib/cars-act.ts).
  initialDraft?: string;
  // Shopper only: documents on their account they can send (see
  // shareDocumentsAction). Empty means none uploaded yet.
  shareableDocs?: ShareableDoc[];
  // Shopper without texts on: offer them once they've written (the phone
  // on their profile prefills it).
  textPrompt?: { defaultPhone: string } | null;
}) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [files, setFiles] = useState<File[]>([]);
  const [docsOpen, setDocsOpen] = useState(false);
  const [pickedDocs, setPickedDocs] = useState<ShareableDoc[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [localOpened, setLocalOpened] = useState<Record<string, string>>({});
  // Ticks once a second while any file is counting down, for the timers.
  const [now, setNow] = useState(() => Date.now());
  const counting = messages.some((m) =>
    (m.attachments ?? []).some((a, i) => !a.deletedAt && (a.openedAt || localOpened[`${m.id}:${i}`]))
  );
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);
  const [draft, setDraft] = useState(initialDraft);
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
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    // Realtime only delivers rows the connection may read, so it needs the
    // viewer's login attached before subscribing — otherwise it connects as
    // a signed-out visitor and row-level security sends nothing.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) supabase.realtime.setAuth(session.access_token);
      channel = supabase
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
        // A file being opened (its countdown starts) or deleted.
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const row = payload.new as MessageRow;
            setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, attachments: row.attachments } : m)));
          }
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, viewerRole, readOnly]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Thumbnails for picked photos, released when the list changes.
  const previews = useMemo(() => files.map((f) => (isDisplayableImage(f.type) ? URL.createObjectURL(f) : "")), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function pickFiles(list: FileList | null) {
    setError(null);
    const picked = Array.from(list ?? []);
    const bad = picked.find((f) => !ATTACHMENT_TYPES.includes(f.type));
    if (bad) setError(`"${bad.name}" can't be attached. Send photos or PDFs.`);
    const ok = picked.filter((f) => ATTACHMENT_TYPES.includes(f.type));
    const next = [...files, ...ok].slice(0, MAX_ATTACHMENTS);
    if (files.length + ok.length > MAX_ATTACHMENTS) setError(`Up to ${MAX_ATTACHMENTS} files per message.`);
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Uploads the picked files straight to storage; returns their attachments.
  async function uploadFiles(): Promise<MessageAttachment[] | string> {
    const ready = await Promise.all(files.map((f) => shrinkImage(f, { minBytes: 1_200_000 })));
    const tooBig = ready.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) return `"${tooBig.name}" is over ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`;
    const prepared = await prepareAttachmentUploadsAction({
      conversationId,
      files: ready.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    });
    if (!prepared.ok) return prepared.error;
    const storage = createClient().storage.from(ATTACHMENT_BUCKET);
    const results = await Promise.all(
      ready.map((f, i) => storage.uploadToSignedUrl(prepared.uploads[i].path, prepared.uploads[i].token, f, { contentType: f.type }))
    );
    if (results.some((r) => r.error)) return "A file didn't upload. Please try again.";
    return ready.map((f, i) => ({
      path: prepared.uploads[i].path,
      name: f.name,
      type: f.type,
      size: f.size,
      kind: isImageType(f.type) ? "photo" : "document",
    }));
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if ((!body && files.length === 0) || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        let attachments: MessageAttachment[] = [];
        if (files.length) {
          const uploaded = await uploadFiles();
          if (typeof uploaded === "string") {
            setError(uploaded);
            return;
          }
          attachments = uploaded;
        }
        const result = await sendMessageAction({ conversationId, body, attachments });
        if (result.ok) {
          setDraft("");
          setFiles([]);
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

  function shareDocs() {
    if (pickedDocs.length === 0 || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await shareDocumentsAction({ conversationId, docs: pickedDocs });
        if (result.ok) {
          setDocsOpen(false);
          setPickedDocs([]);
          setMessages((prev) => (prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message]));
        } else {
          setError(result.error);
        }
      } catch (err) {
        console.error("shareDocumentsAction threw:", err);
        setError("We couldn't share that. Please try again.");
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
                  {mine ? "You" : names[m.sender_role]} · <LocalTime iso={m.created_at} style="time-or-datetime" />
                  {m.channel === "sms" && " · via text"}
                </p>
                {m.body && (
                  <p
                    className={`inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm leading-6 break-words whitespace-pre-wrap ${
                      right ? "bg-accent text-white" : "border border-line bg-raised text-fg"
                    }`}
                  >
                    {m.body}
                  </p>
                )}
                <Attachments
                  message={m}
                  onAccent={right}
                  viewerRole={viewerRole}
                  otherName={viewerRole === "customer" ? names.broker : names.customer}
                  now={now}
                  localOpened={localOpened}
                  onOpened={(key) => setLocalOpened((prev) => (prev[key] ? prev : { ...prev, [key]: new Date().toISOString() }))}
                />
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
          {files.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Files to send">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="relative">
                  {previews[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previews[i]} alt={f.name} className="size-16 rounded-lg border border-line object-cover" />
                  ) : (
                    <span className="flex h-16 max-w-[160px] items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-xs text-fg">
                      <FileText className="size-4 shrink-0 text-fg-muted" />
                      <span className="truncate">{f.name}</span>
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border border-line bg-surface text-fg-muted hover:text-fg"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {docsOpen && (
            <div className="mt-3 rounded-xl border border-line bg-raised p-3 text-sm">
              {shareableDocs.length > 0 ? (
                <>
                  <p className="font-medium text-fg">Send {names.broker} your documents</p>
                  <div className="mt-2 space-y-1.5">
                    {shareableDocs.map((d) => (
                      <label key={d} className="flex items-center gap-2 text-fg-secondary">
                        <input
                          type="checkbox"
                          checked={pickedDocs.includes(d)}
                          onChange={(e) =>
                            setPickedDocs((prev) => (e.target.checked ? [...prev, d] : prev.filter((x) => x !== d)))
                          }
                        />
                        {SHAREABLE_DOCS[d].label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-fg-muted">
                    Only {names.broker} and Drive can see them. Missing one?{" "}
                    <Link href="/customer/dashboard" className="link">
                      Add it on your account
                    </Link>
                    .
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={shareDocs} disabled={pending || pickedDocs.length === 0} className="btn btn-primary btn-sm">
                      {pending ? "Sending…" : "Send"}
                    </button>
                    <button type="button" onClick={() => setDocsOpen(false)} className="btn btn-ghost btn-sm">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-fg-secondary">
                  You haven&apos;t added your driver&apos;s license or insurance card yet.{" "}
                  <Link href="/customer/dashboard" className="link">
                    Add them on your account
                  </Link>
                  , then share them here in one tap.
                </p>
              )}
            </div>
          )}

          <div role="alert">{error && <p className="alert alert-danger mt-3">{error}</p>}</div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <input
                ref={fileInput}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => pickFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={pending || files.length >= MAX_ATTACHMENTS}
                className="btn btn-ghost btn-sm"
              >
                <Paperclip /> Photo or file
              </button>
              {viewerRole === "customer" && (
                <button type="button" onClick={() => setDocsOpen((o) => !o)} disabled={pending} className="btn btn-ghost btn-sm">
                  <IdCard /> Share documents
                </button>
              )}
            </div>
            <button type="submit" disabled={pending || (!draft.trim() && files.length === 0)} className="btn btn-primary">
              <Send /> {pending ? "Sending…" : "Send"}
            </button>
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            Messages are kept on Drive for your records. For privacy, photos and files disappear 15 minutes after
            they&apos;re opened (or after a week if they never are).
          </p>
        </form>
      )}
      {/* Outside the reply form: it has its own forms. */}
      {viewerRole === "customer" && textPrompt && messages.some((m) => m.sender_role === "customer") && (
        <TextRepliesPrompt sellerName={names.broker} defaultPhone={textPrompt.defaultPhone} />
      )}
    </div>
  );
}
