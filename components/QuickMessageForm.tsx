"use client";

// The "Message seller" dialog for someone who isn't signed in: first name,
// mobile number and the message, then the code we text them. They don't
// sign up first; confirming the code makes their account and sends the
// message (app/messages/quick-actions.ts). Anyone who'd rather use email
// can still log in or create an account.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { useCustomerSession } from "@/components/CustomerSession";
import { sendQuickMessageAction, sendQuickMessageCodeAction } from "@/app/messages/quick-actions";

export default function QuickMessageForm({
  deal,
  message,
  setMessage,
  next,
  descId,
}: {
  deal: Deal;
  message: string;
  setMessage: (value: string) => void;
  // Where "Log in" comes back to.
  next: string;
  descId: string;
}) {
  const router = useRouter();
  const session = useCustomerSession();
  const [step, setStep] = useState<"details" | "code">("details");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sendCode(resend = false) {
    setError(null);
    setNotice(null);
    setHasAccount(false);
    startTransition(async () => {
      try {
        const result = await sendQuickMessageCodeAction({ dealId: deal.id, phone });
        if (result.ok) {
          setStep("code");
          setCode("");
          if (resend) setNotice("We sent a new code.");
        } else {
          setError(result.error);
          setHasAccount(result.code === "has-account");
        }
      } catch (err) {
        console.error("sendQuickMessageCodeAction threw:", err);
        setError("We couldn't text a code right now. Please try again.");
      }
    });
  }

  function send() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await sendQuickMessageAction({ dealId: deal.id, firstName, lastName, phone, body: message, code });
        if (result.ok) {
          session?.refresh();
          router.push(`/customer/messages/${result.conversationId}`);
        } else {
          setError(result.error);
          setHasAccount(result.code === "has-account");
        }
      } catch (err) {
        console.error("sendQuickMessageAction threw:", err);
        setError("We couldn't send that message. Please try again.");
      }
    });
  }

  const errorBox = (
    <div role="alert">
      {error && (
        <p className="alert alert-danger mt-4">
          <span>
            {error}
            {hasAccount && (
              <>
                {" "}
                <Link href={`/customer/login?next=${next}`} className="underline">
                  Log in
                </Link>
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );

  if (step === "code") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) send();
        }}
      >
        <p id={descId} className="text-sm text-fg-secondary">
          We texted a 6-digit code to <span className="font-medium text-fg">{phone}</span>. Enter it to send your
          message to {deal.sellerName}.
        </p>
        <label htmlFor="quick-code" className="field-label mt-5">
          Code
        </label>
        <input
          id="quick-code"
          data-autofocus
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          maxLength={10}
          required
          className="input max-w-44 tracking-widest"
        />
        {notice && <p className="mt-2 text-sm text-fg-muted">{notice}</p>}
        {errorBox}
        <button type="submit" disabled={pending || !code.trim()} className="btn btn-primary mt-5 w-full">
          <Send /> {pending ? "Sending…" : `Send to ${deal.sellerName}`}
        </button>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
          <button type="button" onClick={() => setStep("details")} disabled={pending} className="btn btn-ghost btn-sm">
            Change number
          </button>
          <button type="button" onClick={() => sendCode(true)} disabled={pending} className="btn btn-ghost btn-sm">
            Send a new code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) sendCode();
      }}
    >
      <p id={descId} className="text-sm text-fg-secondary">
        No account needed. Confirm your number with a code and your message goes to {deal.sellerName} through
        Drive. Their replies come to you by text.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="quick-first" className="field-label">
            First name
          </label>
          <input
            id="quick-first"
            data-autofocus
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            maxLength={60}
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="quick-last" className="field-label">
            Last name <span className="font-normal text-fg-muted">(optional)</span>
          </label>
          <input
            id="quick-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            maxLength={60}
            className="input"
          />
        </div>
      </div>
      <label htmlFor="quick-phone" className="field-label mt-4">
        Mobile number
      </label>
      <input
        id="quick-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="949-555-1234"
        required
        className="input"
      />
      <label htmlFor="quick-message" className="field-label mt-4">
        Message
      </label>
      <textarea
        id="quick-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={5}
        maxLength={4000}
        required
        className="textarea resize-y"
      />
      {errorBox}
      <button
        type="submit"
        disabled={pending || !firstName.trim() || !phone.trim() || !message.trim()}
        className="btn btn-primary mt-5 w-full"
      >
        {pending ? "Texting a code…" : "Text me a code"}
      </button>
      <p className="mt-3 text-xs leading-5 text-fg-muted">
        We&apos;ll text you a code to confirm your number, then a text when {deal.sellerName} replies. Msg frequency
        varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. See our{" "}
        <Link href="/terms" className="underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="mt-4 border-t border-line pt-4 text-sm text-fg-secondary">
        Prefer email?{" "}
        <Link href={`/customer/login?next=${next}`} className="font-medium text-fg underline">
          Log in
        </Link>{" "}
        or{" "}
        <Link href="/customer/signup" className="font-medium text-fg underline">
          create an account
        </Link>
        .
      </p>
    </form>
  );
}
