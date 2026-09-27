"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Car, ArrowRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { formatCurrency, markDealViewed } from "@/lib/deal-utils";

// A nod to the old iTunes/iPod "Cover Flow" browser — cars stand in for
// albums, flip through them in 3D, center one is the one you're looking at.
// An alternate way to browse the same `deals` list the grid shows, not a
// replacement for it.

const ITEM_WIDTH = 240;
const ITEM_HEIGHT = ITEM_WIDTH * 0.75; // 4:3 — matches typical car listing photos, so nothing gets cropped
const SIDE_SPACING = 140;
const VISIBLE_RANGE = 6;
const SWIPE_THRESHOLD = 40;
const CLICK_MOVE_TOLERANCE = 6;

export default function DealCoverFlow({
  deals,
  initialDealId,
}: {
  deals: Deal[];
  // Set once, right after this mounts, to reopen on the same car a shopper
  // was viewing before navigating to its detail page — see HomeClient.tsx.
  initialDealId?: string | null;
}) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(() => {
    if (!initialDealId) return 0;
    const idx = deals.findIndex((d) => d.id === initialDealId);
    return idx >= 0 ? idx : 0;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; moved: number } | null>(null);
  // Set on pointerup and read by the click handler that fires right after —
  // dragState itself gets cleared on pointerup, so this is what lets a click
  // tell a drag apart from a tap.
  const lastMovedRef = useRef(0);

  // Clamp if the underlying (filtered/sorted) deal list shrinks out from
  // under the current index.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeIndex > deals.length - 1) setActiveIndex(Math.max(0, deals.length - 1));
  }, [deals.length, activeIndex]);

  const goTo = (i: number) => setActiveIndex(Math.max(0, Math.min(deals.length - 1, i)));
  const next = () => goTo(activeIndex + 1);
  const prev = () => goTo(activeIndex - 1);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    } else if (e.key === "Enter") {
      const deal = deals[activeIndex];
      if (deal) {
        markDealViewed(deal.id);
        router.push(`/deals/${deal.slug}`);
      }
    }
  }

  function handlePointerDown(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, moved: 0 };
    lastMovedRef.current = 0;
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    dragState.current.moved = e.clientX - dragState.current.startX;
  }
  function handlePointerUp() {
    const state = dragState.current;
    dragState.current = null;
    if (!state) return;
    lastMovedRef.current = state.moved;
    if (state.moved <= -SWIPE_THRESHOLD) next();
    else if (state.moved >= SWIPE_THRESHOLD) prev();
  }

  function handleCoverClick(i: number) {
    if (Math.abs(lastMovedRef.current) > CLICK_MOVE_TOLERANCE) return; // it was a drag, not a tap
    if (i === activeIndex) {
      const deal = deals[i];
      if (deal) {
        markDealViewed(deal.id);
        router.push(`/deals/${deal.slug}`);
      }
    } else {
      goTo(i);
    }
  }

  const activeDeal = deals[activeIndex];

  const visibleItems = useMemo(() => {
    const items: { deal: Deal; index: number; offset: number }[] = [];
    for (let i = 0; i < deals.length; i++) {
      const offset = i - activeIndex;
      if (Math.abs(offset) > VISIBLE_RANGE) continue;
      items.push({ deal: deals[i], index: i, offset });
    }
    return items;
  }, [deals, activeIndex]);

  if (deals.length === 0) return null;

  return (
    <div className="select-none">
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="media-stage h-[340px] touch-pan-y rounded-3xl border border-line sm:h-[400px]"
        style={{ perspective: "1400px" }}
      >
        {/* reflective floor line (w-auto: let inset-x size it, not .light-bar's w-full) */}
        <div
          aria-hidden="true"
          className="light-bar absolute inset-x-[10%] bottom-[18%] w-auto opacity-40"
        />

        {visibleItems.map(({ deal, index, offset }) => {
          const absOffset = Math.abs(offset);
          const isCenter = offset === 0;
          const translateX = offset * SIDE_SPACING;
          const rotateY = isCenter ? 0 : offset < 0 ? 55 : -55;
          const scale = isCenter ? 1 : Math.max(0.5, 1 - absOffset * 0.11);
          const translateZ = isCenter ? 0 : -absOffset * 60;
          const opacity = Math.max(0, 1 - absOffset * 0.16);
          const image = deal.images[0];

          return (
            <div
              key={deal.id}
              onClick={() => handleCoverClick(index)}
              className="absolute top-1/2 left-1/2 cursor-pointer"
              style={{
                width: ITEM_WIDTH,
                marginLeft: -ITEM_WIDTH / 2,
                marginTop: -ITEM_HEIGHT / 2,
                transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                zIndex: 100 - absOffset,
                opacity,
                transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms",
              }}
            >
              <div
                className="relative overflow-hidden rounded-xl bg-raised shadow-[0_30px_60px_-20px_rgb(0_0_0/0.9)]"
                style={{ height: ITEM_HEIGHT }}
              >
                {image ? (
                  <img
                    src={image}
                    alt={`${deal.year} ${deal.make} ${deal.model}`}
                    className="h-full w-full object-cover object-[50%_58%]"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-faint">
                    <Car size={48} />
                  </div>
                )}
                {/* Same disclosure grid/detail views show for these fields —
                    only on the centered card so the side cards stay clean. */}
                {isCenter &&
                  (deal.sample ? (
                    <span className="media-note media-note-warning">
                      Sample listing — not exact vehicle
                    </span>
                  ) : (
                    deal.photoAutoSourced && (
                      <span className="media-note">Stock photo — may not be exact vehicle</span>
                    )
                  ))}
              </div>
              {/* Glossy floor reflection — mirrors the bottom half of the
                  real photo above it, faded out, like a reflective floor.
                  The image inside renders at full height and gets clipped by
                  this shorter overflow-hidden wrapper; scaleY(-1) is what
                  flips "bottom of the photo" up to sit right under it. */}
              <div
                className="w-full overflow-hidden rounded-xl bg-raised"
                style={{
                  height: ITEM_HEIGHT * 0.5,
                  transform: "scaleY(-1)",
                  maskImage: "linear-gradient(to bottom, rgba(255,255,255,0.28), transparent 70%)",
                  WebkitMaskImage: "linear-gradient(to bottom, rgba(255,255,255,0.28), transparent 70%)",
                }}
              >
                {image && (
                  <img
                    src={image}
                    alt=""
                    aria-hidden="true"
                    className="w-full object-cover object-[50%_58%]"
                    style={{ height: ITEM_HEIGHT }}
                    draggable={false}
                  />
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={prev}
          aria-label="Previous car"
          disabled={activeIndex === 0}
          className="btn btn-secondary btn-icon absolute top-1/2 left-3 z-[200] -translate-y-1/2 bg-canvas/70 backdrop-blur"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next car"
          disabled={activeIndex === deals.length - 1}
          className="btn btn-secondary btn-icon absolute top-1/2 right-3 z-[200] -translate-y-1/2 bg-canvas/70 backdrop-blur"
        >
          <ChevronRight />
        </button>
      </div>

      {activeDeal && (
        <div className="mt-6 flex flex-col items-center text-center">
          <p className="label">
            {activeIndex + 1} of {deals.length}
          </p>
          <h3 className="type-section mt-2 text-2xl sm:text-2xl">
            {activeDeal.year} {activeDeal.make} {activeDeal.model}
            {activeDeal.trim && <span className="text-fg-muted"> {activeDeal.trim}</span>}
          </h3>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="price">
              {formatCurrency(activeDeal.onePay ? activeDeal.dueAtSigning : activeDeal.payment)}
            </span>
            {!activeDeal.onePay && <span className="price-unit">/mo</span>}
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            {!activeDeal.onePay && <>Due at signing {formatCurrency(activeDeal.dueAtSigning)} · </>}
            {activeDeal.term} mo · {activeDeal.city}, {activeDeal.state}
            {activeDeal.brokerFee != null && (
              <> · Broker fee {formatCurrency(activeDeal.brokerFee)}</>
            )}
          </p>
          <Link
            href={`/deals/${activeDeal.slug}`}
            onClick={() => markDealViewed(activeDeal.id)}
            className="btn btn-primary mt-5"
          >
            View full details <ArrowRight />
          </Link>
          <p className="mt-3 text-xs text-fg-muted">
            Drag, click a side car, or use the arrow keys to flip through
          </p>
        </div>
      )}
    </div>
  );
}
