"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { formatCurrency, isNewlyPosted, markDealViewed } from "@/lib/deal-utils";
import { cutoutSrc } from "@/lib/photo-src";

// The homepage hero's featured deal, set like a magazine plate: the car large
// on the page, its numbers printed beside it. A few top deals, stepped with
// the arrows. No auto-advance — it moves only when the shopper moves it.
// Kept short (name, payment, one line) like the original spotlight; the full
// terms are on the deal page. The caption has a fixed height with the arrows
// in its top row, so they don't jump as names change length.
export default function HeroDealsCarousel({ deals }: { deals: Deal[] }) {
  const [index, setIndex] = useState(0);
  if (deals.length === 0) return null;
  const n = deals.length;
  const deal = deals[((index % n) + n) % n];
  const href = `/deals/${deal.slug}`;
  const kind = deal.fuel === "EV" ? "Electric" : deal.bodyStyle;

  return (
    <section aria-label="Featured deal" aria-roledescription="carousel" className="grid items-end gap-x-6 lg:grid-cols-12">
      <Link
        href={href}
        onClick={() => markDealViewed(deal.id)}
        aria-label={`${deal.year} ${deal.make} ${deal.model}`}
        className="media-stage aspect-[16/9] lg:col-span-8 lg:col-start-1 xl:col-span-8 xl:col-start-2"
      >
        <img key={deal.id} src={cutoutSrc(deal.images[0])} alt="" className="media-img animate-fade-in" />
      </Link>

      <div className="mt-5 flex flex-col lg:col-span-4 lg:mt-0 lg:h-[300px] lg:pb-10 xl:col-span-3" aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <p className="label min-w-0">
            Featured{kind ? ` · ${kind}` : ""}
            {isNewlyPosted(deal) ? <span className="text-brand"> · New</span> : ""}
          </p>
          {n > 1 && (
            <div className="flex shrink-0 items-center gap-2 text-xs whitespace-nowrap text-fg-muted">
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                aria-label="Previous deal"
                className="btn btn-icon size-7 border-line-hover p-0 text-fg [--btn-h:1.75rem] [--btn-icon:0.875rem] hover:border-fg"
              >
                <ChevronLeft />
              </button>
              <span className="tabular-nums">
                {((index % n) + n) % n + 1} / {n}
              </span>
              <button
                type="button"
                onClick={() => setIndex((i) => i + 1)}
                aria-label="Next deal"
                className="btn btn-icon size-7 border-line-hover p-0 text-fg [--btn-h:1.75rem] [--btn-icon:0.875rem] hover:border-fg"
              >
                <ChevronRight />
              </button>
            </div>
          )}
        </div>
        <p className="mt-3 min-h-[2.6em] text-xl leading-snug text-fg">
          {deal.year} {deal.make} {deal.model}
          {deal.trim ? <span className="font-serif text-fg-secondary italic"> {deal.trim}</span> : null}
          {deal.condition && deal.condition !== "New" ? (
            <span className="cond-tag ml-2 align-[3px]">{deal.condition}</span>
          ) : null}
        </p>
        <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className="price-lg">{formatCurrency(deal.onePay ? deal.dueAtSigning : deal.payment)}</span>
          <span className="price-unit">
            {deal.onePay ? "one-pay total" : deal.paymentTaxRate ? `/mo (incl. ~${deal.paymentTaxRate}% tax)` : "/mo + tax"}
          </span>
        </p>
        <p className="mt-3.5 border-t border-line pt-3 text-[14.5px] text-fg-secondary">
          {[
            deal.onePay ? null : `${formatCurrency(deal.dueAtSigning)} due at signing`,
            `${deal.term} months`,
            deal.milesPerYear ? `${deal.milesPerYear.toLocaleString("en-US")} mi/yr` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <Link href={href} onClick={() => markDealViewed(deal.id)} className="link-arrow mt-auto self-start">
          View details <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
