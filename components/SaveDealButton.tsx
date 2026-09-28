"use client";

// The heart toggle for saving a deal (see components/CustomerSession.tsx).
// Customers save/remove in place; signed-out visitors are sent to log in
// and brought back here afterwards; broker/admin accounts don't see it at
// all. Renders nothing outside the consumer site's session provider (e.g.
// the /broker portal's deal preview) or before the saved_deals migration
// has been run.
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { markDealViewed } from "@/lib/deal-utils";
import { isSaveableDealId, useCustomerSession, type CustomerSession } from "./CustomerSession";

function canShowSaveButton(session: CustomerSession | null, dealId: string): session is CustomerSession {
  return (
    session !== null &&
    // Not for broker/admin accounts, nor when who's signed in couldn't be
    // told (a signed-in customer would be sent to log in again).
    (session.status === "loading" || session.status === "anonymous" || session.status === "customer") &&
    session.savedDealsAvailable &&
    isSaveableDealId(dealId)
  );
}

// Whether a SaveDealButton for this deal would render — lets a layout
// (DealCard's photo tags) leave room for it only when it's there.
export function useShowSaveDealButton(dealId: string): boolean {
  return canShowSaveButton(useCustomerSession(), dealId);
}

export default function SaveDealButton({
  dealId,
  // "icon": a round glass button for laying over a photo (deal cards).
  // "labeled": a secondary button reading Save — icon-only on phones.
  variant = "icon",
  // What the server already knows (the dashboard only lists saved deals),
  // shown until the session has loaded so those hearts don't flash empty.
  savedHint = false,
  // The id of the deal's title, so each of a grid's identical "Save deal"
  // buttons also says which car it's for.
  describedBy,
  className = "",
}: {
  dealId: string;
  variant?: "icon" | "labeled";
  savedHint?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const session = useCustomerSession();
  const router = useRouter();
  if (!canShowSaveButton(session, dealId)) return null;

  const signedOut = session.status === "anonymous";
  const saved =
    session.status === "loading" ? savedHint : session.status === "customer" && session.isSaved(dealId);
  const pending = session.isSavePending(dealId);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Never let the tap reach a surrounding card link or click handler.
    e.preventDefault();
    e.stopPropagation();
    if (signedOut) {
      // Back to exactly this page (and section) after logging in; the
      // login page re-checks it's a same-site path (lib/safe-next-path.ts).
      // Also marked as the last deal viewed, so back on the homepage the
      // list reopens on this card (see HomeClient) instead of at the top.
      markDealViewed(dealId);
      const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.push(`/customer/login?next=${encodeURIComponent(here)}`);
      return;
    }
    // Still loading, or the last tap on this deal hasn't settled yet.
    if (session.status !== "customer" || pending) return;
    void session.toggleSaved(dealId);
  };

  const shared = {
    type: "button" as const,
    onClick: handleClick,
    // A toggle button: the name stays "Save deal" and aria-pressed says
    // whether it's saved. A name that also flipped (to "Remove…") would
    // announce the state twice and contradict itself.
    "aria-pressed": saved,
    "aria-label": "Save deal",
    "aria-describedby": describedBy,
    "aria-busy": pending || undefined,
    title: signedOut ? "Log in to save deals" : undefined,
  };
  const icon = <Heart className={saved ? "fill-current" : undefined} />;

  if (variant === "labeled") {
    return (
      <button
        {...shared}
        className={`btn btn-secondary btn-sm aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-accent-fg max-sm:w-(--btn-h) max-sm:px-0 ${className}`}
      >
        {icon}
        {/* Fixed, like the name: the filled heart and pressed colors show
            it's saved (and the name keeps starting with the visible word,
            for voice control). */}
        <span className="max-sm:sr-only">Save</span>
      </button>
    );
  }

  return (
    <button
      {...shared}
      className={`btn btn-secondary btn-sm btn-icon bg-canvas/70 backdrop-blur aria-pressed:text-accent-fg ${className}`}
    >
      {icon}
    </button>
  );
}
