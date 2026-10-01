"use client";

// "Get matched with similar deals" in a deal page's contact card: the row
// opens a small dialog that emails the shopper the similar deals shown
// under the listing (server side: app/deals/[slug]/actions.ts, which
// re-reads every deal and decides who the email goes to).
//
// What the dialog asks for depends on who's browsing (CustomerSession):
//   - a customer: nothing to type — it goes to their account email, and
//     "Email me when new matching deals are posted" (on by default, shown
//     once saved searches exist) also sets up an alert;
//   - signed out: an email address, plus links to log in or create an
//     account for alerts;
//   - a broker/admin account (no customers row): an email address, with
//     nothing prefilled.
// The dialog is portalled to <body> so the contact card's sticky column
// can't trap it under the page's other layers.
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleAlert, CircleCheck, Send, X } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle } from "@/lib/deal-utils";
import {
  EMAIL_MAX,
  INVALID_EMAIL_MESSAGE,
  MAX_SIMILAR_IDS,
  MISSING_EMAIL_MESSAGE,
  isValidEmailAddress,
} from "@/lib/get-matched";
import { getMatchedAction, type GetMatchedResult, type MatchAlertOutcome } from "@/app/deals/[slug]/actions";
import { useCustomerSession } from "./CustomerSession";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function GetMatchedButton({
  deal,
  similarIds,
  alertsAvailable,
  className,
  children,
}: {
  deal: Deal;
  similarIds: string[];
  // Whether saved searches exist yet (supabase/migrations/0017), so the
  // alert checkbox can be offered.
  alertsAvailable: boolean;
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
      {open && (
        <GetMatchedDialog
          deal={deal}
          similarIds={similarIds}
          alertsAvailable={alertsAvailable}
          returnFocusRef={triggerRef}
          onClose={close}
        />
      )}
    </>
  );
}

type Outcome =
  | { kind: "idle" }
  // alert: an alert that was set up even though the email didn't go out.
  | { kind: "error"; code: string; message: string; alert?: MatchAlertOutcome }
  | { kind: "sent"; result: GetMatchedResult & { ok: true } };

function GetMatchedDialog({
  deal,
  similarIds,
  alertsAvailable,
  returnFocusRef,
  onClose,
}: {
  deal: Deal;
  similarIds: string[];
  alertsAvailable: boolean;
  // The row button: focus goes back to it on close. Passed in rather than
  // read from document.activeElement, since Safari doesn't focus a button
  // that's clicked.
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const session = useCustomerSession();
  const pathname = usePathname();
  const titleId = useId();
  const descId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const successId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  // Where a press on the scrim started — a drag that starts inside the
  // dialog (selecting text) and ends on the scrim shouldn't close it.
  const pressStartedOnScrim = useRef(false);

  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [subscribe, setSubscribe] = useState(true);
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const status = session?.status ?? "anonymous";
  const isCustomer = status === "customer";
  const loading = status === "loading";
  // Anyone signed in gets it at their account address, no typing — a
  // broker/admin account too (just without the alert option, which needs a
  // customer profile).
  const usesAccountEmail = isCustomer || (status === "non-customer" && Boolean(session?.email));
  // Log-in and create-account links only make sense for someone signed
  // out (or who might be — "unknown"), not for a broker/admin account.
  const offerAccount = status === "anonymous" || status === "unknown";
  const title = dealTitle(deal);
  const loginHref = `/customer/login?next=${encodeURIComponent(pathname || "/")}`;
  const hasSimilar = similarIds.length > 0;
  // Which form is showing; see the focus effect below.
  const mode = loading ? "loading" : usesAccountEmail ? "account" : "guest";

  // What the page read about the account may be out of date (signed in or
  // finished a profile in another tab, since this page loaded), so check
  // again on open. The current form stays up meanwhile.
  const refreshSession = session?.refresh;
  useEffect(() => {
    refreshSession?.();
  }, [refreshSession]);

  // Focus goes into the dialog on open and back to whatever opened it
  // (the row button) on close; the page behind doesn't scroll meanwhile.
  useEffect(() => {
    const opener = returnFocusRef.current;
    const dialog = dialogRef.current;
    // The email field or the Send button; while the session is still
    // loading, the close button.
    const first =
      dialog?.querySelector<HTMLElement>("[data-autofocus]") ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [returnFocusRef]);

  // The form can change under the dialog: the session finishes loading
  // after it opened, or a customer turns out to be signed out (the
  // "signed-out" error refreshes the session). Focus then moves on to the
  // new form's field or Send button — unless it's already in a field.
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;
    const inField = active instanceof HTMLInputElement && dialog.contains(active);
    if (!inField) dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [mode]);

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
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
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

  // The form is replaced by the confirmation, so focus moves to its Done
  // button rather than dropping to the page.
  const sent = outcome.kind === "sent";
  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  // Shown under the email field. The customer form has no field, so there
  // an invalid-email error goes in the alert below instead.
  const emailError =
    !usesAccountEmail && outcome.kind === "error" && outcome.code === "invalid-email" ? outcome.message : null;
  // Focus goes to the field so its error (aria-describedby) is read out.
  useEffect(() => {
    if (emailError) emailRef.current?.focus();
  }, [emailError]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending || loading) return;

    const typed = email.trim();
    if (!usesAccountEmail) {
      if (!typed || !isValidEmailAddress(typed)) {
        setOutcome({
          kind: "error",
          code: "invalid-email",
          message: typed ? INVALID_EMAIL_MESSAGE : MISSING_EMAIL_MESSAGE,
        });
        return;
      }
    }

    setOutcome({ kind: "idle" });
    startTransition(async () => {
      try {
        const result = await getMatchedAction({
          dealId: deal.id,
          similarIds: similarIds.slice(0, MAX_SIMILAR_IDS),
          // A signed-in account's email always goes to its own address (the
          // server looks it up), so nothing typed is sent for them.
          email: usesAccountEmail ? null : typed,
          website,
          subscribe: isCustomer && alertsAvailable && subscribe,
        });
        if (result.ok) {
          setOutcome({ kind: "sent", result });
        } else {
          setOutcome({ kind: "error", code: result.code, message: result.error, alert: result.alert });
          // The server doesn't see a customer any more: re-read the session
          // so the dialog falls back to the email field.
          if (result.code === "signed-out") session?.refresh();
        }
      } catch (err) {
        console.error("getMatchedAction threw:", err);
        setOutcome({
          kind: "error",
          code: "failed",
          message: "We couldn't send the email. Please try again in a few minutes.",
        });
      }
    });
  };

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
            Get matched with similar deals
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost btn-icon btn-sm shrink-0"
          >
            <X />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          <p id={descId} className="text-sm leading-6 text-fg-secondary">
            {hasSimilar ? (
              <>We&apos;ll email you deals similar to the {title}, with a link back to this one.</>
            ) : isCustomer && alertsAvailable ? (
              <>
                We don&apos;t have other listings like the {title} right now. We&apos;ll email you a link back
                to it and to all deals, and can let you know when new matching deals are posted.
              </>
            ) : (
              <>
                We don&apos;t have other listings like the {title} right now. We&apos;ll email you a link back
                to it and to all deals.
              </>
            )}
          </p>

          {/* Mounted from the start, so the confirmation is announced when
              it's written into it. */}
          <div role="status">{sent && <SentMessage id={successId} result={outcome.result} />}</div>

          {sent ? (
            <button
              ref={doneRef}
              type="button"
              onClick={onClose}
              aria-describedby={successId}
              className="btn btn-secondary mt-5 w-full"
            >
              Done
            </button>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="mt-5">
              {loading ? (
                <p className="text-sm text-fg-muted">One moment…</p>
              ) : usesAccountEmail ? (
                <>
                  <p className="text-sm leading-6 text-fg-secondary">
                    We&apos;ll send them to{" "}
                    <span className="font-medium break-all text-fg">{session?.email ?? "your account email"}</span>.
                  </p>
                  {isCustomer && alertsAvailable && (
                    <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg-secondary">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={subscribe}
                        onChange={(e) => setSubscribe(e.target.checked)}
                      />
                      Email me when new matching deals are posted
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label htmlFor={emailId} className="field-label">
                    Email
                  </label>
                  <input
                    ref={emailRef}
                    id={emailId}
                    data-autofocus
                    type="email"
                    name="email"
                    autoComplete="email"
                    inputMode="email"
                    maxLength={EMAIL_MAX}
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setOutcome({ kind: "idle" });
                    }}
                    aria-invalid={emailError ? true : undefined}
                    aria-describedby={emailError ? emailErrorId : undefined}
                    className="input"
                  />
                  {/* A live region too, for an error that appears while focus
                      is already in the field (Enter pressed there). */}
                  <div aria-live="polite">
                    {emailError && (
                      <p id={emailErrorId} className="field-error">
                        {emailError}
                      </p>
                    )}
                  </div>
                  {/* Honeypot: hidden from people and screen readers; a bot
                      that fills in every field gives itself away. */}
                  <div aria-hidden="true" className="hidden">
                    <label>
                      Website
                      <input
                        type="text"
                        name="website"
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </label>
                  </div>
                  {offerAccount && (
                    <div className="mt-3 space-y-1 text-[13px] leading-5 text-fg-muted">
                      <p>
                        Have an account?{" "}
                        <Link href={loginHref} className="link inline-flex min-h-9 items-center">
                          Log in
                        </Link>
                      </p>
                      <p>
                        <Link href="/customer/signup" className="link inline-flex min-h-9 items-center">
                          Create a free account to get alerts for new matches
                        </Link>
                      </p>
                    </div>
                  )}
                </>
              )}

              <div role="alert">
                {outcome.kind === "error" && !emailError && (
                  <div className="alert alert-danger mt-4">
                    <CircleAlert />
                    <p className="min-w-0">
                      {outcome.message}
                      {outcome.code === "not-listed" && (
                        <>
                          {" "}
                          <Link href="/#deals" className="link whitespace-nowrap">
                            Browse all deals
                          </Link>
                        </>
                      )}
                      {outcome.code === "signed-out" && (
                        <>
                          {" "}
                          <Link href={loginHref} className="link whitespace-nowrap">
                            Log in
                          </Link>
                        </>
                      )}
                      {outcome.code === "unavailable" && offerAccount && (
                        <>
                          {" "}
                          Customers can{" "}
                          <Link href={loginHref} className="link">
                            log in
                          </Link>{" "}
                          to get it now.
                        </>
                      )}
                      {(outcome.alert === "created" || outcome.alert === "exists") && (
                        <>
                          {" "}
                          Your alert for new matching deals is set up, though.{" "}
                          <Link href="/customer/dashboard#alerts" className="link whitespace-nowrap">
                            Manage alerts
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                data-autofocus={usesAccountEmail ? true : undefined}
                aria-busy={pending || undefined}
                // Stays focusable while sending or loading (a disabled
                // button would drop keyboard focus to the page).
                aria-disabled={pending || loading || undefined}
                className="btn btn-primary mt-5 w-full"
              >
                <Send />
                {pending ? "Sending…" : "Send"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

function SentMessage({ id, result }: { id: string; result: GetMatchedResult & { ok: true } }) {
  return (
    <div id={id} className="alert alert-success mt-5">
      <CircleCheck />
      <div className="min-w-0">
        <p className="font-medium">Sent — check your inbox.</p>
        {result.alert === "created" && (
          <p className="mt-1 text-fg-secondary">
            We&apos;ll also email you when new matching deals are posted.{" "}
            <Link href="/customer/dashboard#alerts" className="link whitespace-nowrap">
              Manage alerts
            </Link>
          </p>
        )}
        {result.alert === "exists" && (
          <p className="mt-1 text-fg-secondary">
            You already have an alert for deals like this.{" "}
            <Link href="/customer/dashboard#alerts" className="link whitespace-nowrap">
              Manage alerts
            </Link>
          </p>
        )}
        {result.alert === "failed" && (
          <p className="mt-1 text-fg-secondary">
            {result.alertError ? (
              <>
                We couldn&apos;t set up an alert for new matches. {result.alertError}
                {result.alertLimitReached && (
                  <>
                    {" "}
                    <Link href="/customer/dashboard#alerts" className="link whitespace-nowrap">
                      Manage alerts
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>
                We couldn&apos;t set up an alert for new matches this time. You can save a search from the
                deals list instead.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
