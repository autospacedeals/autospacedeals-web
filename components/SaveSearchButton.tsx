"use client";

// "Save this search" at the foot of the homepage's filter panel (see
// supabase/migrations/0017_saved_searches.sql). Customers save the current
// filters in place and get a confirmation with a link to manage their
// alerts; signed-out visitors are sent to log in and brought back to the
// deals list with their filters restored (see HomeClient); broker/admin
// accounts don't see it. Renders nothing outside the consumer site's
// session provider or before the migration has been run (`available`).
// `compact` is the small version HomeClient shows above the results on
// small screens while the filter panel is collapsed: a small button with
// its hint for screen readers only, shown only once a filter is set.
import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellPlus, CircleAlert, CircleCheck } from "lucide-react";
import type { DealFilters } from "@/lib/deal-utils";
import { PENDING_SAVED_SEARCH_KEY, hasActiveFilters, savedSearchKey } from "@/lib/saved-searches";
import { saveSearchAction } from "@/app/customer/saved-searches-actions";
import { useCustomerSession } from "./CustomerSession";

type Outcome =
  | { kind: "saved" | "already-saved" }
  | { kind: "error"; message: string };

export default function SaveSearchButton({
  filters,
  available,
  compact = false,
  className = "mt-5 border-t border-line pt-5",
}: {
  filters: DealFilters;
  available: boolean;
  compact?: boolean;
  className?: string;
}) {
  const session = useCustomerSession();
  const router = useRouter();
  const hintId = useId();
  const [pending, startTransition] = useTransition();
  // Which filters the last outcome was for — it's only shown while the
  // filters are still the same, so changing one clears the message.
  const [outcome, setOutcome] = useState<{ key: string; result: Outcome } | null>(null);

  if (
    !available ||
    session === null ||
    // Not for broker/admin accounts, nor when who's signed in couldn't be
    // told (a signed-in customer would be sent to log in again).
    !(session.status === "loading" || session.status === "anonymous" || session.status === "customer")
  ) {
    return null;
  }

  const key = savedSearchKey(filters);
  const active = hasActiveFilters(filters);
  const shown = outcome?.key === key ? outcome.result : null;
  const saved = shown?.kind === "saved" || shown?.kind === "already-saved";
  // Until the session has loaded it isn't known whether a click should
  // save or go to log in, so the button waits like it does mid-save.
  const loading = session.status === "loading";
  const busy = pending || loading;

  if (compact && !active && !shown) return null;

  const handleClick = () => {
    if (!active || busy || saved) return;
    if (session.status === "anonymous") {
      // Kept for this tab only, so the homepage can put these filters back
      // after logging in (the page reloads from scratch on the way back).
      try {
        sessionStorage.setItem(PENDING_SAVED_SEARCH_KEY, JSON.stringify(filters));
      } catch {
        // Ignore — they'll just have to set their filters again.
      }
      router.push(`/customer/login?next=${encodeURIComponent("/#deals")}`);
      return;
    }
    if (session.status !== "customer") return;
    startTransition(async () => {
      try {
        const result = await saveSearchAction(filters);
        setOutcome({
          key,
          result: result.ok
            ? { kind: result.alreadySaved ? "already-saved" : "saved" }
            : { kind: "error", message: result.error },
        });
      } catch (err) {
        console.error("saveSearchAction threw:", err);
        setOutcome({ key, result: { kind: "error", message: "We couldn't save this search. Please try again." } });
      }
    });
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={!active}
        aria-describedby={hintId}
        aria-busy={pending || undefined}
        // Saving, still loading the session, or already saved: nothing to
        // do, but it stays focusable (a disabled button would drop keyboard
        // focus to the page, and not give it back once the result is in).
        aria-disabled={saved || busy || undefined}
        className={compact ? "btn btn-secondary btn-sm" : "btn btn-secondary w-full"}
      >
        {saved ? <CircleCheck /> : <BellPlus />}
        {pending ? "Saving…" : saved ? "Search saved" : "Save this search"}
      </button>
      <p id={hintId} className={compact ? "sr-only" : "field-hint mt-2"}>
        {!active
          ? "Set a filter or search first, then save it to get emails about new matching deals."
          : loading
            ? "Save these filters to get emails about new matching deals."
            : session.status === "anonymous"
              ? "Log in to save this search and get emails about new matching deals."
              : "We'll email you when new deals match these filters."}
      </p>

      <div role="status">
        {shown && (
          <div
            className={`alert mt-3 ${shown.kind === "error" ? "alert-danger" : "alert-success"}`}
          >
            {shown.kind === "error" ? <CircleAlert /> : <CircleCheck />}
            <p className="min-w-0">
              {shown.kind === "error"
                ? shown.message
                : shown.kind === "already-saved"
                  ? "You've already saved this search."
                  : "Search saved. We'll email you when new matching deals are posted."}{" "}
              {shown.kind !== "error" && (
                <Link href="/customer/dashboard#alerts" className="link whitespace-nowrap">
                  Manage alerts
                </Link>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
