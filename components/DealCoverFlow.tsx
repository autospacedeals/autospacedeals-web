"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Car, ArrowRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { formatCurrency } from "@/lib/deal-utils";

// A nod to the old iTunes/iPod "Cover Flow" browser — cars stand in for
// albums, flip through them in 3D, center one is the one you're looking at.
// An alternate way to browse the same `deals` list the grid shows, not a
// replacement for it.

const ITEM_WIDTH = 220;
const SIDE_SPACING = 130;
const VISIBLE_RANGE = 6;
const SWIPE_THRESHOLD = 40;
const CLICK_MOVE_TOLERANCE = 6;

export default function DealCoverFlow({ deals }: { deals: Deal[] }) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; moved: number } | null>(null);
  // Set on pointerup and read by the click handler that fires right after —
  // dragState itself gets cleared on pointerup, so this is what lets a click
  // tell a drag apart from a tap.
  const lastMovedRef = useRef(0);

  // Clamp if the underlying (filtered/sorted) deal list shrinks out from
  // under the current index.
  useEffect(() => {
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
      if (deal) router.push(`/deals/${deal.slug}`);
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
      if (deal) router.push(`/deals/${deal.slug}`);
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
        className="relative h-[320px] touch-pan-y overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent outline-none focus-visible:ring-2 focus-visible:ring-white/30 sm:h-[380px]"
        style={{ perspective: "1400px" }}
      >
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
              className="absolute left-1/2 top-1/2 cursor-pointer"
              style={{
                width: ITEM_WIDTH,
                marginLeft: -ITEM_WIDTH / 2,
                marginTop: -ITEM_WIDTH / 2,
                transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                zIndex: 100 - absOffset,
                opacity,
                transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms",
              }}
            >
              <div className="overflow-hidden rounded-lg shadow-2xl shadow-black/60">
                {image ? (
                  <img
                    src={image}
                    alt={`${deal.year} ${deal.make} ${deal.model}`}
                    className="aspect-square w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-zinc-800 text-zinc-600">
                    <Car size={48} />
                  </div>
                )}
              </div>
              {/* Glossy floor reflection — the whole reason this exists */}
              <div
                className="w-full overflow-hidden rounded-lg"
                style={{
                  height: ITEM_WIDTH * 0.5,
                  transform: "scaleY(-1)",
                  maskImage: "linear-gradient(to bottom, rgba(255,255,255,0.28), transparent 70%)",
                  WebkitMaskImage: "linear-gradient(to bottom, rgba(255,255,255,0.28), transparent 70%)",
                }}
              >
                {image ? (
                  <img
                    src={image}
                    alt=""
                    aria-hidden="true"
                    className="aspect-square w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-zinc-800" />
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
          className="absolute left-3 top-1/2 z-[200] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-zinc-950/80 text-zinc-300 backdrop-blur transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next car"
          disabled={activeIndex === deals.length - 1}
          className="absolute right-3 top-1/2 z-[200] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-zinc-950/80 text-zinc-300 backdrop-blur transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {activeDeal && (
        <div className="mt-6 flex flex-col items-center text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {activeIndex + 1} of {deals.length}
          </p>
          <h3 className="mt-1 text-2xl font-black">
            {activeDeal.year} {activeDeal.make} {activeDeal.model}
            {activeDeal.trim && <span className="text-zinc-400"> {activeDeal.trim}</span>}
          </h3>
          <p className="mt-1 text-lg font-bold text-white">
            {formatCurrency(activeDeal.onePay ? activeDeal.dueAtSigning : activeDeal.payment)}
            {!activeDeal.onePay && <span className="text-sm font-medium text-zinc-500">/mo</span>}
            <span className="ml-2 text-sm font-medium text-zinc-500">
              · {activeDeal.term} mo · {activeDeal.city}, {activeDeal.state}
            </span>
          </p>
          <Link
            href={`/deals/${activeDeal.slug}`}
            className="mt-4 flex items-center gap-1.5 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
          >
            View Full Details <ArrowRight size={15} />
          </Link>
          <p className="mt-3 text-xs text-zinc-600">
            Drag, click a side car, or use the arrow keys to flip through
          </p>
        </div>
      )}
    </div>
  );
}
