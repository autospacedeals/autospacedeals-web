"use client";

// "Message seller" (and the "Request this deal" / "Check availability"
// shortcuts) on a listing: a small dialog with a ready-written message the
// shopper can edit, sent through Drive's own messaging (app/messages/
// actions.ts) so the conversation stays on record — sellers' phone numbers
// and emails aren't shown on the site. Needs a shopper account; anyone
// else gets a log-in / sign-up prompt instead. Same dialog behaviour as
// GetMatched.tsx (portal, focus trap, Escape/scrim to close).
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, Send, UserPlus, X } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency } from "@/lib/deal-utils";
import { useCustomerSession } from "@/components/CustomerSession";
import { startConversationAction } from "@/app/messages/actions";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type ContactKind = "message" | "request" | "availability";

const TITLES: Record<ContactKind, string> = {
  message: "Message seller",
  request: "Request this deal",
  availability: "Check availability",
};

function defaultMessage(deal: Deal, kind: ContactKind): string {
  const title = dealTitle(deal);
  if (kind === "message") return `Hi ${deal.sellerName}, I have a question about the ${title}.\n\n`;
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
  const session = useCustomerSession();
  const pathname = usePathname();
  const router = useRouter();

  const [message, setMessage] = useState(() => defaultMessage(deal, kind));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const status = session?.status ?? "anonymous";
  const next = encodeURIComponent(pathname || "/");

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

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await startConversationAction({ dealId: deal.id, body: message });
        if (result.ok) {
          router.push(`/customer/messages/${result.conversationId}`);
        } else {
          setError(result.error);
          if (result.code === "signed-out") session?.refresh();
        }
      } catch (err) {
        console.error("startConversationAction threw:", err);
        setError("We couldn't send that message. Please try again.");
      }
    });
  }

  let content: React.ReactNode;
  if (status === "loading") {
    content = <p className="text-sm text-fg-muted">One moment…</p>;
  } else if (status === "customer") {
    content = (
      <form onSubmit={send}>
        <p id={descId} className="text-sm text-fg-secondary">
          Your message goes to {deal.sellerName} through Drive, and their replies show up in your
          Messages. Edit it however you like first.
        </p>
        <label htmlFor={messageId} className="field-label mt-5">
          Message
        </label>
        <textarea
          id={messageId}
          data-autofocus
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          maxLength={4000}
          required
          className="textarea resize-y"
        />
        <div role="alert">{error && <p className="alert alert-danger mt-4">{error}</p>}</div>
        <button type="submit" disabled={pending || !message.trim()} className="btn btn-primary mt-5 w-full">
          <Send /> {pending ? "Sending…" : `Send to ${deal.sellerName}`}
        </button>
      </form>
    );
  } else if (status === "non-customer") {
    content = (
      <p id={descId} className="text-sm text-fg-secondary">
        Messaging sellers needs a shopper account — this account is a dealer/broker or admin one.
      </p>
    );
  } else {
    content = (
      <div>
        <p id={descId} className="text-sm text-fg-secondary">
          Log in or create a free account to message {deal.sellerName}. Your conversation is kept in
          your Messages, and you&apos;ll get an email when they reply.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link href={`/customer/login?next=${next}`} data-autofocus className="btn btn-primary">
            <LogIn /> Log in
          </Link>
          <Link href="/customer/signup" className="btn btn-secondary">
            <UserPlus /> Create account
          </Link>
        </div>
      </div>
    );
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
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{content}</div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
