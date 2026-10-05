"use client";

import { useState, useTransition } from "react";
import { setConversationOutcomeAction } from "@/app/messages/actions";

const OPTIONS = [
  { value: "sold", label: "Sold" },
  { value: "working", label: "Still working" },
  { value: "lost", label: "Didn't buy" },
] as const;

// "How did this one go?" on a conversation, for the seller (and admins).
// Only Drive sees the answer — it's how sales are counted.
export default function ConversationOutcome({
  conversationId,
  initialOutcome,
}: {
  conversationId: string;
  initialOutcome: string | null;
}) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pick(next: string) {
    const prev = outcome;
    setOutcome(next);
    setError(null);
    startTransition(async () => {
      const result = await setConversationOutcomeAction({ conversationId, outcome: next });
      if (result.error) {
        setOutcome(prev);
        setError(result.error);
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg-muted">How did this one go?</span>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={pending}
          aria-pressed={outcome === o.value}
          onClick={() => pick(o.value)}
          className={`btn btn-sm ${outcome === o.value ? (o.value === "sold" ? "btn-primary" : "btn-tonal") : "btn-secondary"}`}
        >
          {o.label}
        </button>
      ))}
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
}
