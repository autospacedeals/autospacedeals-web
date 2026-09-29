"use client";

// "Request this deal" / "Check availability" in a deal page's contact card.
// These used to be plain mailto: links, which silently do nothing for anyone
// without a desktop email app set up (most people on Gmail/Yahoo in the
// browser). The row now opens a small dialog with the message already
// written, and ways to send it that always work: text the seller, open it
// in an email app, or copy the message and the seller's email to paste
// anywhere. Nothing is sent through Drive — it all goes straight from the
// shopper to the seller. Same dialog behaviour as GetMatched.tsx (portal,
// focus trap, Escape/scrim to close).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Mail, MessageSquare, X } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency, phoneDigits } from "@/lib/deal-utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ContactKind = "request" | "availability";

const TITLES: Record<ContactKind, string> = {
  request: "Request this deal",
  availability: "Check availability",
};

function defaultMessage(deal: Deal, kind: ContactKind): string {
  const title = dealTitle(deal);
  if (kind === "availability") {
    return `Hi ${deal.sellerName}, is this deal still available?\n\n${title}\n${deal.city}, ${deal.state}\n\nThanks!`;
  }
  const price = deal.onePay
    ? `${formatCurrency(deal.dueAtSigning)} one-pay`
    : `${formatCurrency(deal.payment)}/mo, ${formatCurrency(deal.dueAtSigning)} due at signing`;
  return `Hi ${deal.sellerName}, I found this deal on Drive and I'd like to move forward:\n\n${title}\n${price}, ${deal.term} month ${deal.dealType.toLowerCase()}\n\nIs it still available?\n\nThanks!`;
}

export function ContactSellerButton({
  deal,
  kind,
  className,
  children,
}: {
  deal: Deal;
  kind: ContactKind;
  className: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={className}
      >
        {children}
      </button>
      {open && <ContactSellerDialog deal={deal} kind={kind} returnFocusRef={triggerRef} onClose={close} />}
    </>
  );
}

function ContactSellerDialog({
  deal,
  kind,
  returnFocusRef,
  onClose,
}: {
  deal: Deal;
  kind: ContactKind;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const messageId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const pressStartedOnScrim = useRef(false);

  const [message, setMessage] = useState(() => defaultMessage(deal, kind));
  const [copied, setCopied] = useState<"message" | "email" | null>(null);
  // Set when the browser refused both copy methods: the text is selected
  // instead so the shopper can press the copy shortcut themselves.
  const [manualCopy, setManualCopy] = useState<"message" | "email" | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLParagraphElement>(null);

  const phone = phoneDigits(deal.sellerPhone);
  const email = deal.sellerEmail?.trim() ?? "";
  const subject = `${TITLES[kind]}: ${dealTitle(deal)}`;
  // "?&body=" is the form both iOS and Android Messages accept.
  const smsHref = phone ? `sms:${phone}?&body=${encodeURIComponent(message)}` : null;
  const mailHref = email
    ? `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    : null;

  // Focus into the dialog on open, back to the row button on close; the
  // page behind doesn't scroll meanwhile.
  useEffect(() => {
    const opener = returnFocusRef.current;
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [returnFocusRef]);

  // Escape closes; Tab stays inside the dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(what: "message" | "email") {
    const text = what === "message" ? `${subject}\n\n${message}` : email;
    setManualCopy(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      return;
    } catch {
      // Blocked (e.g. in-app browsers, some privacy settings) — try the
      // older selection-based copy next.
    }
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    dialogRef.current?.appendChild(scratch);
    scratch.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    scratch.remove();
    if (ok) {
      setCopied(what);
      return;
    }
    // Last resort: select it on screen and say how to copy.
    if (what === "message" && messageRef.current) {
      messageRef.current.focus();
      messageRef.current.select();
    } else if (emailRef.current) {
      const range = document.createRange();
      range.selectNodeContents(emailRef.current);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setManualCopy(what);
  }

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-scrim backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => {
        pressStartedOnScrim.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressStartedOnScrim.current) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="modal flex max-h-[88vh] w-full animate-rise flex-col sm:max-w-md"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <h2 id={titleId} className="type-title pt-1.5">
            {TITLES[kind]}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">
            <X />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">
          <p id={descId} className="text-sm text-fg-secondary">
            Send {deal.sellerName} this message by text or email — you can edit it first. It goes
            straight to them.
          </p>

          <label htmlFor={messageId} className="field-label mt-5">
            Message
          </label>
          <textarea
            ref={messageRef}
            id={messageId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={7}
            className="textarea resize-y"
          />

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {smsHref && (
              <a href={smsHref} data-autofocus className="btn btn-primary">
                <MessageSquare /> Text {deal.sellerName}
              </a>
            )}
            {mailHref && (
              <a href={mailHref} data-autofocus={smsHref ? undefined : true} className="btn btn-secondary">
                <Mail /> Open in email app
              </a>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-line bg-hover p-4">
            <p className="text-xs leading-5 text-fg-muted">
              Use Gmail or another web email? Copy the message and send it to:
            </p>
            {email && (
              <p ref={emailRef} className="mt-1 text-sm font-medium break-all text-fg">
                {email}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => copy("message")} className="btn btn-secondary btn-sm">
                {copied === "message" ? <Check /> : <Copy />} {copied === "message" ? "Copied" : "Copy message"}
              </button>
              {email && (
                <button type="button" onClick={() => copy("email")} className="btn btn-ghost btn-sm">
                  {copied === "email" ? <Check /> : <Copy />} {copied === "email" ? "Copied" : "Copy email"}
                </button>
              )}
            </div>
            <p aria-live="polite" className={manualCopy ? "mt-3 text-xs text-fg-secondary" : "sr-only"}>
              {manualCopy
                ? `Your browser blocked copying — the ${manualCopy === "message" ? "message" : "email address"} is selected, press ⌘C (Ctrl+C on Windows) to copy it.`
                : copied === "message"
                  ? "Message copied"
                  : copied === "email"
                    ? "Email address copied"
                    : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
