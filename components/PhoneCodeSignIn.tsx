"use client";

// "Sign in with a text code" on the shopper login page, for accounts made
// by messaging a seller with just a phone number (no password or email; see
// app/messages/quick-actions.ts). Starts folded away under a link.
import { useState, useTransition } from "react";
import { Smartphone } from "lucide-react";
import { sendSignInCodeAction, signInWithCodeAction } from "@/app/messages/quick-actions";

export default function PhoneCodeSignIn({ next = null }: { next?: string | null }) {
  const [step, setStep] = useState<"closed" | "phone" | "code">("closed");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sendCode() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await sendSignInCodeAction(phone);
        if (result.ok) {
          setCode("");
          setStep("code");
        } else setError(result.error);
      } catch (err) {
        console.error("sendSignInCodeAction threw:", err);
        setError("We couldn't text a code right now. Please try again.");
      }
    });
  }

  function signIn() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await signInWithCodeAction(phone, code, next);
        // A full load, so every part of the page picks up the new session.
        if (result.ok) window.location.assign(result.to);
        else setError(result.error);
      } catch (err) {
        console.error("signInWithCodeAction threw:", err);
        setError("We couldn't sign you in. Please try again.");
      }
    });
  }

  if (step === "closed") {
    return (
      <button type="button" onClick={() => setStep("phone")} className="btn btn-secondary w-full">
        <Smartphone /> Sign in with a text code
      </button>
    );
  }

  return (
    <form
      className="rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (step === "phone") sendCode();
        else signIn();
      }}
    >
      {step === "phone" ? (
        <>
          <label htmlFor="code-signin-phone" className="field-label">
            Mobile number
          </label>
          <p className="mb-2 text-xs text-fg-muted">For accounts started by messaging a seller with your phone.</p>
          <input
            id="code-signin-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="949-555-1234"
            required
            className="input"
          />
          <button type="submit" disabled={pending || !phone.trim()} className="btn btn-primary mt-3 w-full">
            {pending ? "Texting a code…" : "Text me a code"}
          </button>
          <p className="mt-2 text-xs leading-5 text-fg-muted">Msg &amp; data rates may apply.</p>
        </>
      ) : (
        <>
          <label htmlFor="code-signin-code" className="field-label">
            Code we texted to {phone}
          </label>
          <input
            id="code-signin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            maxLength={10}
            required
            className="input max-w-44 tracking-widest"
          />
          <button type="submit" disabled={pending || !code.trim()} className="btn btn-primary mt-3 w-full">
            {pending ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={() => setStep("phone")} disabled={pending} className="btn btn-ghost btn-sm mt-2">
            Change number
          </button>
        </>
      )}
      <div role="alert">{error && <p className="field-error mt-2">{error}</p>}</div>
    </form>
  );
}
