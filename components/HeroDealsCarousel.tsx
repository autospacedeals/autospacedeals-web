"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency, formatTerm, isNewlyPosted, markDealViewed } from "@/lib/deal-utils";
import { BADGE_STYLES } from "@/components/DealCard";

// The homepage hero's "Deals" spotlight: a few top deals, one card at a
// time, swiped/scrolled sideways (scroll-snap) or stepped with the arrows
// and dots. No auto-advance — it moves only when the shopper moves it.
export default function HeroDealsCarousel({ deals }: { deals: Deal[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function goTo(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(deals.length - 1, i));
    // Set right away so a quick second click steps on from here rather
    // than from wherever the smooth scroll has got to.
    setIndex(next);
    track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  if (deals.length === 0) return null;

  return (
    <aside aria-label="Deals" aria-roledescription="carousel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="label">Deals</p>
        <div className="flex items-center gap-1">
          {deals.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index === 0}
                aria-label="Previous deal"
                className="btn btn-ghost btn-icon btn-sm"
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                disabled={index >= deals.length - 1}
                aria-label="Next deal"
                className="btn btn-ghost btn-icon btn-sm"
              >
                <ChevronRight />
              </button>
            </>
          )}
          <a href="#deals" className="link-arrow ml-2 pointer-coarse:-my-3 pointer-coarse:min-h-11">
            All deals <ArrowRight />
          </a>
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-2xl"
      >
        {deals.map((deal, i) => (
          <div
            key={deal.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${deals.length}`}
            className="w-full shrink-0 snap-start"
          >
            <DealSlide deal={deal} />
          </div>
        ))}
      </div>

      {deals.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {deals.map((deal, i) => (
            <button
              key={deal.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Show deal ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
              className="flex h-6 items-center px-0.5"
            >
              <span
                className={`block h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-accent" : "w-1.5 bg-line-strong"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

function DealSlide({ deal }: { deal: Deal }) {
  return (
    <Link
      href={`/deals/${deal.slug}`}
      onClick={() => markDealViewed(deal.id)}
      className="card-interactive group block overflow-hidden"
    >
      <div className="media-stage aspect-[4/3]">
        <img src={deal.images[0]} alt={dealTitle(deal)} className="media-img" />
        {/* Same tags as the deal cards: freshness and badges on the left,
            condition (New, Loaner…) on the right. */}
        <div className="absolute top-3 right-3 left-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {isNewlyPosted(deal) && (
              <span className="tag">
                <span className="tag-dot" /> Just listed
              </span>
            )}
            {deal.badge && BADGE_STYLES[deal.badge] && <span className={BADGE_STYLES[deal.badge]}>{deal.badge}</span>}
            {!deal.inStock && (
              <span className="tag">
                <span className="tag-dot tag-dot-warning" /> Pending · call to confirm
              </span>
            )}
          </div>
          {deal.condition && <span className="tag shrink-0">{deal.condition}</span>}
        </div>
        {deal.sample ? (
          <p className="media-note media-note-warning">
            <CircleAlert /> Sample listing — photo not exact vehicle
          </p>
        ) : (
          deal.photoAutoSourced && <p className="media-note">Stock photo — may not be exact vehicle</p>
        )}
      </div>
      <div className="flex items-end justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="label">
            {deal.year} {deal.make}
          </p>
          <p className="type-card mt-1 truncate">
            {deal.model}
            {deal.trim ? ` ${deal.trim}` : ""}
          </p>
          <p className="mt-1.5 text-[13px] text-fg-muted">
            {!deal.onePay && `${formatCurrency(deal.dueAtSigning)} due · `}
            {formatTerm(deal.term)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="price">{formatCurrency(deal.onePay ? deal.dueAtSigning : deal.payment)}</p>
          <p className="price-unit mt-1.5 text-xs">
            {deal.onePay
              ? "one-pay total"
              : deal.paymentTaxRate
                ? `/mo (incl. ~${deal.paymentTaxRate}% tax)`
                : "/mo + tax"}
          </p>
        </div>
      </div>
    </Link>
  );
}
