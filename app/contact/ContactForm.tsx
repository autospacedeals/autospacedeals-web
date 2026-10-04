"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CircleCheck, Send } from "lucide-react";
import { sendContactAction, type ContactState } from "./actions";

const initialState: ContactState = { status: "idle" };

// Same list as the server action, which falls back to "Something else".
const TOPICS = ["Shopping for a car", "Dealer or broker account", "A listing", "Something else"];

export default function ContactForm({
  defaultEmail = "",
  defaultTopic,
}: {
  defaultEmail?: string;
  defaultTopic?: string;
}) {
  const [state, formAction, pending] = useActionState(sendContactAction, initialState);

  if (state.status === "sent") {
    return (
      <div role="status" className="space-y-5">
        <p className="alert alert-success">
          <CircleCheck />
          <span>Thanks — your message is on its way. We&apos;ll reply to your email, usually within a day.</span>
        </p>
        <Link href="/" className="btn btn-secondary w-full">
          Back to deals
        </Link>
      </div>
    );
  }

  const values = state.status === "error" ? state.values : null;
  // Remounting the fields with the submitted values keeps what was typed
  // after an error (a form action resets uncontrolled fields).
  const key = state.status === "error" ? state.error + state.values.message.length : "initial";

  return (
    <form key={key} action={formAction} className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="field-label">
          Name <span className="text-fg-faint">(optional)</span>
        </label>
        <input
          id="contact-name"
          name="name"
          autoComplete="name"
          maxLength={100}
          defaultValue={values?.name}
          className="input"
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="field-label">
          Email
        </label>
        <input
          id="contact-email"
          required
          type="email"
          name="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={values?.email ?? defaultEmail}
          className="input"
        />
      </div>
      <div>
        <label htmlFor="contact-topic" className="field-label">
          What&apos;s it about?
        </label>
        <select
          id="contact-topic"
          name="topic"
          defaultValue={values?.topic ?? defaultTopic ?? TOPICS[0]}
          className="select"
        >
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="contact-message" className="field-label">
          Message
        </label>
        <textarea
          id="contact-message"
          required
          name="message"
          rows={6}
          maxLength={5000}
          defaultValue={values?.message}
          className="textarea"
        />
      </div>
      {/* Honeypot: hidden from people and screen readers; a bot that fills
          in every field gives itself away. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.status === "error" && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        <Send /> {pending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
