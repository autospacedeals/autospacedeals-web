"use client";

// "Text me new messages" on the shopper and broker dashboards: enter a
// mobile number, confirm it with the texted code, and texts are on. Only
// rendered when Twilio is configured (the page decides).
import { useState, useTransition } from "react";
import { MessageSquareText } from "lucide-react";
import {
  confirmSmsVerificationAction,
  disableSmsAction,
  startSmsVerificationAction,
} from "@/app/messages/sms-actions";

export default function SmsSettings({
  enabledPhone,
  defaultPhone,
}: {
  // The confirmed number texts go to, formatted, when texts are on.
  enabledPhone: string | null;
  // Prefill for the number field (the phone on their profile).
  defaultPhone: string;
}) {
  const [step, setStep] = useState<"off" | "code" | "on">(enabledPhone ? "on" : "off");
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState("");
  const [onPhone, setOnPhone] = useState(enabledPhone);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        console.error("SMS settings action threw:", err);
        setError("Something went wrong — please try again.");
      }
    });
  };

  const sendCode = () =>
    run(async () => {
      const r = await startSmsVerificationAction(phone);
      if (r.ok) setStep("code");
      else setError(r.error);
    });
  const confirm = () =>
    run(async () => {
      const r = await confirmSmsVerificationAction(code);
      if (r.ok) {
        setOnPhone(phone);
        setStep("on");
        setCode("");
      } else setError(r.error);
    });
  const turnOff = () =>
    run(async () => {
      const r = await disableSmsAction();
      if (r.ok) setStep("off");
      else setError(r.error);
    });

  return (
    <div className="text-sm">
      <p className="flex items-center gap-2 font-medium text-fg">
        <MessageSquareText size={16} className="text-fg-muted" /> Text me new messages
      </p>

      {step === "on" && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-fg-secondary">
            On — texts go to <span className="font-medium text-fg">{onPhone}</span>. Reply to a text to answer.
          </p>
          <button type="button" onClick={turnOff} disabled={pending} className="btn btn-secondary btn-sm">
            Turn off
          </button>
        </div>
      )}

      {step === "off" && (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <div className="flex flex-wrap gap-2">
            <label htmlFor="sms-phone" className="sr-only">
              Mobile number
            </label>
            <input
              id="sms-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="949-555-1234"
              className="input input-sm max-w-52"
            />
            <button type="submit" disabled={pending || !phone.trim()} className="btn btn-secondary btn-sm">
              {pending ? "Sending…" : "Text me a code"}
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-fg-muted">
            By turning on texts you agree to receive a text from Drive when you get a new message,
            at this number. Message frequency varies with your conversations. Msg &amp; data rates
            may apply. Reply STOP to opt out, HELP for help.
          </p>
        </form>
      )}

      {step === "code" && (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <p className="text-fg-secondary">We texted a code to {phone}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label htmlFor="sms-code" className="sr-only">
              Code
            </label>
            <input
              id="sms-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={10}
              className="input input-sm max-w-36"
            />
            <button type="submit" disabled={pending || !code.trim()} className="btn btn-primary btn-sm">
              {pending ? "Checking…" : "Confirm"}
            </button>
            <button type="button" onClick={() => setStep("off")} disabled={pending} className="btn btn-ghost btn-sm">
              Change number
            </button>
          </div>
        </form>
      )}

      {error && <p className="field-error mt-2">{error}</p>}
    </div>
  );
}
