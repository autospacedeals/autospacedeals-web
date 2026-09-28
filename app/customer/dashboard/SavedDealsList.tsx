"use client";

// The dashboard's saved-deals grid, kept in step with the hearts on it. The
// list itself comes from the server (lib/supabase/saved-deals.ts), so a deal
// removed here would otherwise stay on screen looking saved until the next
// page load. Instead its card gives way to a short "removed" note with an
// Undo, in the same spot, so nothing else in the grid jumps under the
// customer's finger. Until the session has loaded (or if it can't be read)
// every card shows just as the server sent it.
import { useEffect, useId, useRef } from "react";
import { Undo2 } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle } from "@/lib/deal-utils";
import DealCard from "@/components/DealCard";
import { useCustomerSession } from "@/components/CustomerSession";

export default function SavedDealsList({ deals }: { deals: Deal[] }) {
  return (
    <div className="mt-4 grid gap-6 sm:grid-cols-2">
      {deals.map((deal) => (
        <SavedDeal key={deal.id} deal={deal} />
      ))}
    </div>
  );
}

function SavedDeal({ deal }: { deal: Deal }) {
  const session = useCustomerSession();
  const removed =
    session !== null &&
    session.status === "customer" &&
    session.savedDealsAvailable &&
    !session.isSaved(deal.id);
  const cardRef = useRef<HTMLDivElement>(null);
  // Set by Undo, so the heart gets focus back once the card returns.
  const refocusHeart = useRef(false);

  useEffect(() => {
    if (removed || !refocusHeart.current) return;
    refocusHeart.current = false;
    cardRef.current?.querySelector<HTMLElement>("button[aria-pressed]")?.focus();
  }, [removed]);

  if (session && removed) {
    return (
      <RemovedDeal
        deal={deal}
        // Still on its way to the database: removed just now, on this page
        // (rather than found already removed when the session loaded).
        justRemoved={session.isSavePending(deal.id)}
        onUndo={() => {
          refocusHeart.current = true;
          void session.toggleSaved(deal.id);
        }}
      />
    );
  }

  return (
    <div ref={cardRef} className="h-full">
      <DealCard deal={deal} savedHint />
    </div>
  );
}

function RemovedDeal({
  deal,
  justRemoved,
  onUndo,
}: {
  deal: Deal;
  justRemoved: boolean;
  onUndo: () => void;
}) {
  const messageId = useId();
  const undoRef = useRef<HTMLButtonElement>(null);

  // The heart that removed this deal went away with its card. If it had
  // focus, hand focus to Undo instead of letting it drop to the page.
  useEffect(() => {
    if (!justRemoved) return;
    const active = document.activeElement;
    if (!active || active === document.body) undoRef.current?.focus();
  }, [justRemoved]);

  return (
    <div className="card flex flex-col items-center justify-center px-6 py-10 text-center">
      <p id={messageId} className="max-w-xs text-sm text-fg-muted">
        <span className="font-medium text-fg">{dealTitle(deal)}</span> was removed from your saved
        deals.
      </p>
      <button
        ref={undoRef}
        type="button"
        onClick={onUndo}
        aria-describedby={messageId}
        className="btn btn-secondary btn-sm mt-4"
      >
        <Undo2 /> Undo
      </button>
    </div>
  );
}
