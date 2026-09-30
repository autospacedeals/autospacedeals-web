"use client";

// Email field for the signup forms that catches a mistyped domain
// ("name@gmai.com") once you leave the field and offers the fix in one
// click — a typo there means the confirmation email never arrives. See
// lib/email-typos.ts (the server actions refuse the same typos).
import { useId, useState } from "react";
import { suggestEmailFix } from "@/lib/email-typos";

export default function EmailInput({ id, className }: { id: string; className: string }) {
  const hintId = useId();
  const [value, setValue] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);

  return (
    <>
      <input
        id={id}
        required
        type="email"
        name="email"
        autoComplete="email"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (suggestion) setSuggestion(null);
        }}
        onBlur={() => setSuggestion(suggestEmailFix(value.trim()))}
        aria-describedby={suggestion ? hintId : undefined}
        className={className}
      />
      {suggestion && (
        <p id={hintId} role="status" className="mt-1.5 text-[13px] text-warning">
          Did you mean{" "}
          <button
            type="button"
            onClick={() => {
              setValue(suggestion);
              setSuggestion(null);
            }}
            className="font-semibold text-fg underline underline-offset-2 hover:text-accent-fg"
          >
            {suggestion}
          </button>
          ?
        </p>
      )}
    </>
  );
}
