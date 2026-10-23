"use client";

// The listing assistant panel (lib/listing-assistant.ts): a chat box where
// the seller types a change for many cars at once, sees which cars it
// touches, and applies (or undoes) it — plus the list of their standing
// rules.
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CornerDownLeft, Sparkles, Trash2, Undo2, X } from "lucide-react";
import type { AssistantMessageView, AssistantRuleView, AssistantUsage } from "@/lib/listing-assistant-store";
import {
  applyListingAssistantAction,
  askListingAssistantAction,
  cancelListingAssistantAction,
  deleteListingRuleAction,
  requestMoreAssistantUsageAction,
  undoListingAssistantAction,
} from "./assistant-actions";

const EXAMPLES = [
  "Loyalty is required on all my BMWs",
  "My broker fee is $595 on every car",
  "All my cars can be delivered nationwide",
];

const carCount = (n: number) => `${n} car${n === 1 ? "" : "s"}`;

function ProposalCard({
  m,
  busy,
  onApply,
  onCancel,
  onUndo,
}: {
  m: AssistantMessageView;
  busy: boolean;
  onApply: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  const p = m.preview;
  if (!m.kind || !p) return null;
  const verb = m.kind === "remove" ? "Takes down" : "Changes";
  return (
    <div className="mt-2 rounded-[3px] border border-line bg-raised p-3 text-sm">
      <p className="font-medium text-fg">{m.summary}</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg-secondary">
        {p.changes.map((c) => (
          <li key={c} className="break-words">
            {c}
          </li>
        ))}
      </ul>
      {p.count > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-fg-secondary">
            {verb} {carCount(p.count)} now
          </summary>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pl-1 text-xs text-fg-muted">
            {p.cars.map((c) => (
              <li key={c}>{c}</li>
            ))}
            {p.moreCars > 0 && <li>…and {p.moreCars} more</li>}
          </ul>
        </details>
      ) : (
        <p className="mt-2 text-fg-muted">None of your current cars match; it applies to matching cars you add later.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.status === "proposed" && (
          <>
            <button type="button" onClick={onApply} disabled={busy} className="btn btn-primary btn-sm">
              <Check /> {busy ? "Applying…" : "Apply"}
            </button>
            <button type="button" onClick={onCancel} disabled={busy} className="btn btn-ghost btn-sm">
              <X /> Cancel
            </button>
          </>
        )}
        {m.status === "applied" && (
          <>
            <span className="pill pill-success">Applied</span>
            <button type="button" onClick={onUndo} disabled={busy} className="btn btn-ghost btn-sm">
              <Undo2 /> {busy ? "Undoing…" : "Undo"}
            </button>
          </>
        )}
        {m.status === "undone" && <span className="pill pill-neutral">Undone</span>}
        {m.status === "cancelled" && <span className="pill pill-neutral">Cancelled</span>}
      </div>
    </div>
  );
}

export default function ListingAssistant({
  initialMessages,
  rules,
  disclaimerMakes,
  initialUsage,
}: {
  initialMessages: AssistantMessageView[];
  rules: AssistantRuleView[];
  disclaimerMakes: string[];
  initialUsage: AssistantUsage;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [usage, setUsage] = useState(initialUsage);
  const [requesting, setRequesting] = useState(false);
  const outOfMessages = usage.used >= usage.limit;
  const left = Math.max(0, usage.limit - usage.used);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pendingText]);

  const replace = (m: AssistantMessageView) => setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));

  function send(text: string) {
    const message = text.trim();
    if (!message || pendingText) return;
    setError(null);
    setPendingText(message);
    setDraft("");
    startTransition(async () => {
      const result = await askListingAssistantAction(message);
      setPendingText(null);
      if (result.usage) setUsage(result.usage);
      if (result.error) {
        setError(result.error);
        setDraft(message);
      } else if (result.message) {
        setMessages((prev) => [...prev, result.message!]);
      }
    });
  }

  function run(id: string, action: (id: string) => Promise<{ error: string | null; message?: AssistantMessageView }>) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await action(id);
      setBusyId(null);
      if (result.message) replace(result.message);
      if (result.error) setError(result.error);
    });
  }

  function requestMore() {
    setError(null);
    setRequesting(true);
    startTransition(async () => {
      const result = await requestMoreAssistantUsageAction();
      setRequesting(false);
      if (result.usage) setUsage(result.usage);
      if (result.error) setError(result.error);
    });
  }

  function deleteRule(rule: AssistantRuleView) {
    if (!window.confirm(`Delete this rule?\n\n${rule.summary}\n\nIts programs and description lines come off your cars.`)) return;
    setError(null);
    setBusyId(rule.id);
    startTransition(async () => {
      const result = await deleteListingRuleAction(rule.id);
      setBusyId(null);
      if (result.message) setMessages((prev) => [...prev, result.message!]);
      if (result.error) setError(result.error);
    });
  }

  return (
    <section id="assistant" aria-labelledby="assistant-heading" className="panel mt-8 max-w-3xl sm:p-8">
      <h2 id="assistant-heading" className="panel-title">
        <Sparkles /> Listing assistant
      </h2>
      <p className="mt-1 text-sm text-fg-secondary">
        Tell it what to change across your cars, like a required program, your broker fee or a line for the
        description. You&apos;ll see which cars it changes before anything happens. It keeps applying to matching cars
        you add or sync later.
      </p>

      <div ref={listRef} className="mt-5 max-h-[480px] space-y-4 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && !pendingText && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setDraft(ex)} className="chip text-left">
                {ex}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-[3px] rounded-br-md bg-accent-soft px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-fg">
              {m.message}
            </p>
            <div className="max-w-[92%]">
              <p className="text-sm break-words whitespace-pre-wrap text-fg-secondary">{m.reply}</p>
              <ProposalCard
                m={m}
                busy={busyId === m.id}
                onApply={() => run(m.id, applyListingAssistantAction)}
                onCancel={() => run(m.id, cancelListingAssistantAction)}
                onUndo={() => run(m.id, undoListingAssistantAction)}
              />
            </div>
          </div>
        ))}
        {pendingText && (
          <div className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-[3px] rounded-br-md bg-accent-soft px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-fg">
              {pendingText}
            </p>
            <p className="text-sm text-fg-muted">Looking at your cars…</p>
          </div>
        )}
      </div>

      {error && !outOfMessages && (
        <p role="alert" className="alert alert-danger mt-4">
          {error}
        </p>
      )}

      {outOfMessages && (
        <div role="status" className="alert alert-warning mt-4 flex flex-wrap items-center justify-between gap-3">
          <p>
            {usage.request === "pending"
              ? "You've used today's assistant messages. Your request for more is waiting for approval — we'll email you."
              : usage.request === "denied"
                ? "You've used today's assistant messages. They reset over the next 24 hours."
                : `You've used today's ${usage.limit} assistant messages.`}
          </p>
          {usage.request === null && (
            <button type="button" onClick={requestMore} disabled={requesting} className="btn btn-primary btn-sm">
              {requesting ? "Requesting…" : "Request more"}
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="mt-4 flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={2}
          maxLength={1000}
          aria-label="Message the listing assistant"
          placeholder='e.g. "Loyalty is required on all the BMWs except the M3"'
          className="textarea min-h-0 flex-1 resize-none"
        />
        <button type="submit" disabled={!draft.trim() || Boolean(pendingText) || outOfMessages} className="btn btn-primary">
          <CornerDownLeft /> Send
        </button>
      </form>
      {!outOfMessages && left <= 10 && (
        <p className="mt-2 text-xs text-fg-muted">
          {left} message{left === 1 ? "" : "s"} left today
        </p>
      )}

      {(rules.length > 0 || disclaimerMakes.length > 0) && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-fg">Your standing rules</h3>
          <p className="mt-0.5 text-xs text-fg-muted">Applied to matching cars now and to every car you add or sync later.</p>
          <ul className="mt-3 divide-y divide-line rounded-[3px] border border-line">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium break-words text-fg">{r.summary}</p>
                  <p className="mt-0.5 text-xs break-words text-fg-muted">{r.changes.join(" · ")}</p>
                  {r.instruction && <p className="mt-0.5 text-xs break-words text-fg-faint">You said: &ldquo;{r.instruction}&rdquo;</p>}
                </div>
                <button
                  type="button"
                  onClick={() => deleteRule(r)}
                  disabled={busyId === r.id}
                  className="btn btn-ghost btn-icon btn-sm -mr-2 shrink-0"
                  aria-label={`Delete rule: ${r.summary}`}
                >
                  <Trash2 />
                </button>
              </li>
            ))}
            {disclaimerMakes.map((make) => (
              <li key={make} className="px-4 py-3 text-sm">
                <p className="font-medium text-fg">{make} disclaimer</p>
                <p className="mt-0.5 text-xs text-fg-muted">Added to the end of every {make} listing. Text us to change it.</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
