import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { SITE_NAME, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Text Message Alerts",
  description: `How ${SITE_NAME}'s optional text alerts for new messages work, and how to opt in or out.`,
  path: "/text-alerts",
});

// Public description of the optional SMS program, including a copy of the
// opt-in form exactly as signed-in users see it on their dashboard
// (components/messages/SmsSettings.tsx) — so carriers reviewing the program
// can see the opt-in without an account. Keep the wording in step with
// that component.
export default function TextAlertsPage() {
  return (
    <main className="container-prose py-12 sm:py-16">
      <p className="eyebrow">Messaging</p>
      <h1 className="type-page mt-4">Text message alerts</h1>
      <div className="prose-drive mt-6">
        <p>
          Shoppers and dealers/brokers talk to each other through {SITE_NAME}&apos;s on-site
          messaging. If you&apos;d like, {SITE_NAME} can also text you whenever you get a new
          message, and you can reply to that text to answer. Text alerts are optional — you never
          need them to use {SITE_NAME}.
        </p>
        <h2>How to opt in</h2>
        <p>
          Sign in, open your account dashboard (the Messages section for shoppers, or the top of
          the dealer/broker dashboard), turn on <strong>Text me new messages</strong>, enter your
          mobile number, and confirm it with the one-time code we text you. This is the form you
          see:
        </p>
      </div>

      {/* A non-working copy of the dashboard form, for reference. */}
      <div className="panel mt-6 max-w-lg" aria-label="Example of the opt-in form">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <MessageSquareText size={16} className="text-fg-muted" /> Text me new messages
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="tel"
            disabled
            placeholder="949-555-1234"
            aria-label="Mobile number (example)"
            className="input input-sm max-w-52"
          />
          <button type="button" disabled className="btn btn-secondary btn-sm">
            Text me a code
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-fg-muted">
          By turning on texts you agree to receive a text from Drive when you get a new message,
          at this number. Texts are optional and not required to use Drive. Message frequency varies
          with your conversations. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for
          help. See our{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <div className="prose-drive mt-8">
        <h2>What we send</h2>
        <p>
          One text for each new message you receive on {SITE_NAME}, for example:
        </p>
        <blockquote>
          Drive · Pyramid Auto Sales about the 2026 Mercedes-Benz GLB 250: &quot;Yes, it&apos;s still
          available. Want to set up a time to sign?&quot; Reply to this text to answer, or open
          https://www.idriveus.com/customer/messages
        </blockquote>
        <p>After you confirm your number we send one confirmation text:</p>
        <blockquote>
          Drive: You&apos;ll now get a text when you have a new message on Drive. Reply to a message
          text to answer it. Msg frequency varies. Msg &amp; data rates may apply. Reply STOP to opt
          out, HELP for help.
        </blockquote>
        <p>
          We never send marketing or promotional texts. Message frequency varies with your
          conversations. Message and data rates may apply.
        </p>
        <h2>How to opt out or get help</h2>
        <p>
          Reply <strong>STOP</strong> to any text to stop all texts, or turn texts off on your
          dashboard. Reply <strong>START</strong> to turn them back on. Reply <strong>HELP</strong>{" "}
          for help, or email{" "}
          <a href="mailto:rob@idriveus.com" className="link">
            rob@idriveus.com
          </a>
          . Carriers are not liable for delayed or undelivered messages.
        </p>
        <h2>Privacy</h2>
        <p>
          We use your mobile number only to send these alerts and receive your replies. We do not
          sell or share your SMS opt-in data or personal information with third parties for
          marketing purposes. No mobile
          information will be shared with third parties or affiliates for marketing or promotional
          purposes; text messaging opt-in data and consent are never shared with anyone. See our{" "}
          <Link href="/privacy" className="link">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="link">
            Terms of Service
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
