"use client";

import { useState, useTransition } from "react";
import { setMessageEmailsAction } from "@/app/messages/actions";

// "Email me when I get a new message" — for shoppers and brokers alike.
export default function MessageEmailsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await setMessageEmailsAction(next);
      if (result.error) {
        setEnabled(!next);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg-secondary">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="checkbox mt-px"
        />
        <span>
          Email me when I get a new message
          <span className="mt-0.5 block text-xs text-fg-muted">
            At most one email per conversation until you&apos;ve read it.
          </span>
        </span>
      </label>
      {error && <p className="field-error mt-2">{error}</p>}
    </div>
  );
}
