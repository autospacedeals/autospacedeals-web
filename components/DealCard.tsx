// Needs to be a Client Component: the onClick handlers below (markDealViewed)
// attach an event listener to <Link>. DealCard is rendered both from Client
// Components (the homepage grid) and true Server Components (the "Similar
// Deals" section on every /deals/[slug] page via DealDetailView) — without
// this directive, the Server Component render path crashes with "Event
// handlers cannot be passed to Client Component props" on every single deal
// page, since a Server Component can't hand a function prop to <Link>.
"use client";

import { deliveryLabel } from "@/lib/deal-location";
import { CardTaxLine } from "@/components/TaxRate";
import { useId } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import {
  dealTitle,
  displayMsrp,
  formatCurrency,
  isNewlyPosted,
  markDealViewed,
  msrpDiscountPercent,
  formatMsds,
  hasOtherMileages,
  otherTermsNote,
} from "@/lib/deal-utils";
import { isRequiredProgram } from "@/lib/deal-options";
import { TOTAL_PRICE_SUFFIX } from "@/lib/cars-act";
import { ContactActionsCompact } from "./ContactActions";
import SaveDealButton, { useShowSaveDealButton } from "./SaveDealButton";
import { cutoutSrc } from "@/lib/photo-src";

// HOT and VALUE badges were dropped per Robert — too cluttered for the
// clean look he wants. Only badge types listed here render at all; a
// legacy `badge: "HOT"` value on an old row just won't match and won't
// show anything. Exported so the deal detail page's photo badge respects
// the same allowlist. Every allowed badge now renders as the same neutral
// glass `.tag` — the value is the class to use.
export const BADGE_STYLES: Record<string, string> = {
  NEW: "tag",
  EV: "tag",
};

export default function DealCard({
  deal,
  compareSelected,
  onToggleCompare,
  compareDisabled,
  savedHint,
  otherSellers = [],
}: {
  deal: Deal;
  // The same deal listed by other sellers (lib/deal-utils.ts groupSameDeals),
  // named under this seller; the deal page lists them all.
  otherSellers?: Deal[];
  // Compare-mode props are all optional and only passed from the homepage
  // grid — DealCard renders in several other places (similar deals, a
  // broker's public profile) where comparing doesn't make sense, and
  // omitting these just hides the checkbox rather than requiring every
  // call site to pass no-op handlers.
  compareSelected?: boolean;
  onToggleCompare?: () => void;
  compareDisabled?: boolean;
  // Passed by the dashboard's saved-deals list — see SaveDealButton.
  savedHint?: boolean;
}) {
  const image = deal.images[0];
  const discount = msrpDiscountPercent(deal);
  const detailHref = `/deals/${deal.slug}`;
  const showSave = useShowSaveDealButton(deal.id);
  const titleId = useId();
  const requires = (deal.incentives ?? []).filter(isRequiredProgram);
  // "also 24 & 36 months · other mileages too"
  const otherPricing = [otherTermsNote(deal), hasOtherMileages(deal) ? "other mileages too" : null]
    .filter(Boolean)
    .join(" · ");

  // No box: a heavy rule on top, then the car straight on the page.
  return (
    <article className="rule-top group flex h-full flex-col pt-3.5">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="label">{[deal.bodyStyle, fuelLabel(deal.fuel)].filter(Boolean).join(" · ")}</p>
          {isNewlyPosted(deal) && (
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-brand uppercase">
              <span aria-hidden="true" className="size-1.5 rotate-45 bg-brand" /> Just listed
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deal.badge && BADGE_STYLES[deal.badge] && deal.badge !== "NEW" && (
            <span className="cond-tag">{deal.badge}</span>
          )}
          {deal.condition && deal.condition !== "New" && <span className="cond-tag">{deal.condition}</span>}
          {!deal.inStock && <span className="cond-tag text-warning">Pending · call to confirm</span>}
          {showSave && <SaveDealButton dealId={deal.id} savedHint={savedHint} describedBy={titleId} />}
        </div>
      </div>

      <Link
        href={detailHref}
        onClick={() => markDealViewed(deal.id)}
        className="mt-1 block rounded-[2px] focus-visible:outline-offset-4"
      >
        {/* The car is the biggest thing on the card: the cutout runs a little
            past the card's edges (into the grid gap). */}
        <div className="media-stage -mx-[4%] aspect-[16/9.4] sm:-mx-[7%]">
          {/* Lazy: the homepage grid renders every deal at once, and these
              are full-size dealer/manufacturer photos (often 1–2 MB each). */}
          <img src={cutoutSrc(image)} alt={dealTitle(deal)} loading="lazy" decoding="async" className="media-img scale-105" />
        </div>
        {deal.sample ? (
          <p className="mt-1 flex items-center justify-center gap-1.5 text-center text-[12px] font-medium text-warning [&_svg]:size-3.5">
            <CircleAlert /> Sample listing — photo not exact vehicle
          </p>
        ) : null}
        <h3 id={titleId} className="type-card mt-2.5 text-2xl">
          {deal.make} {deal.model}
        </h3>
        {/* line-clamp, not truncate: nowrap text would set the card's
            min-content width and could push the phone grid wider than
            the screen on a long trim. */}
        <p className="mt-0.5 line-clamp-1 font-serif text-base text-fg-secondary italic">
          {deal.year}
          {deal.trim ? ` · ${deal.trim}` : ""}
        </p>
      </Link>

      {/* In order of importance: the monthly payment, what's due at signing,
          the term and miles, any eligibility the price needs; then MSRP, fees
          and the total price as small print. */}
      <div className="flex flex-1 flex-col">
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-1">
            <span className="price text-[2.625rem] sm:text-[2.875rem]">
              {formatCurrency(deal.onePay ? deal.dueAtSigning : deal.payment)}
            </span>
            <span className="price-unit">
              {deal.onePay
                ? "one-pay lease total"
                : deal.paymentTaxRate
                  ? `/mo (incl. ~${deal.paymentTaxRate}% tax)`
                  : "/mo + tax"}
            </span>
          </p>
          {discount > 0 && (
            <p className="shrink-0 pb-1 text-[13px] font-semibold text-brand">{discount.toFixed(0)}% off MSRP</p>
          )}
        </div>
        {/* The lower payment with MSDs, spelled out so it can't be read as the
            advertised price. */}
        {!deal.onePay && deal.msdPayment && deal.msdCount ? (
          <p className="mt-2 text-[13.5px] text-fg-secondary">
            Option: <strong className="font-semibold text-fg">{formatCurrency(deal.msdPayment)}/mo</strong> if you also
            pay {deal.msdTotal ? formatCurrency(deal.msdTotal) : `${deal.msdCount} MSD${deal.msdCount === 1 ? "" : "s"}`} in
            refundable deposits
          </p>
        ) : null}
        {!deal.onePay && (
          <p className="mt-2.5 text-[17px] text-fg-secondary">
            <strong className="text-xl font-semibold text-fg tabular-nums">{formatCurrency(deal.dueAtSigning)}</strong> due at
            signing
          </p>
        )}
        <p className="mt-1 text-[14.5px] text-fg-secondary">
          {deal.term}-month {deal.dealType === "Finance" ? "finance" : "lease"}
          {deal.milesPerYear ? ` · ${deal.milesPerYear.toLocaleString("en-US")} miles a year` : ""}
        </p>
        {requires.length > 0 && (
          <p className="mt-2 flex items-start gap-2 text-[13px] leading-[1.35] font-semibold text-fg">
            <span aria-hidden="true" className="mt-[5px] size-1.5 shrink-0 rotate-45 border-[1.5px] border-brand" />
            Requires {requires.map((i) => i.name).join(" & ")} eligibility
          </p>
        )}
        {/* With the signed-in shopper's sales tax (California ZIPs). */}
        <CardTaxLine deal={deal} />

        <div className="mt-3.5 space-y-0.5 border-t border-line pt-2.5 [&_p]:text-[12.5px] [&_p]:leading-[1.45]">
          <p className="spec-footnote">
            {deal.brokerFee != null && (
              <>
                Broker fee <strong>{formatCurrency(deal.brokerFee)}</strong>, paid on top of the due at signing ·{" "}
              </>
            )}
            MSRP {displayMsrp(deal)}
          </p>
          {deal.dueAtSigningTaxRate ? (
            <p className="spec-footnote">Due at signing assumes {deal.dueAtSigningTaxRate}% tax</p>
          ) : null}
          {/* The vehicle's total price, when the seller gives it (required on
              dealership listings by California's CARS Act). */}
          {deal.sellingPrice != null && (
            <p className="spec-footnote">
              Total price <strong>{formatCurrency(deal.sellingPrice)}</strong>
              {TOTAL_PRICE_SUFFIX}
            </p>
          )}
          {/* When MSDs are an option, the line above the due already says so. */}
          {deal.msdCount && !deal.msdPayment ? (
            <p className="spec-footnote">
              Payment assumes <strong>{formatMsds(deal.msdCount, deal.msdTotal)}</strong> · paid at signing
            </p>
          ) : null}
          {otherPricing && <p className="spec-footnote first-letter:uppercase">{otherPricing}</p>}
        </div>

        {/* Seller + actions are one unit anchored to the card bottom, so
            action rows line up across a grid row. */}
        <div className="mt-auto pt-5">
          <div className="text-[12.5px] leading-5 text-fg-secondary">
            <p>
              {deal.brokerId ? (
                <Link
                  href={`/brokers/${deal.brokerId}`}
                  className="font-semibold text-fg underline decoration-line-hover underline-offset-[3px] transition-colors hover:decoration-fg"
                >
                  {deal.sellerName}
                </Link>
              ) : (
                <span className="font-semibold text-fg">{deal.sellerName}</span>
              )}{" "}
              · {deal.sellerType}
              {deal.sellerDealership && ` at ${deal.sellerDealership}`}
            </p>
            <p>
              {deal.city}, {deal.state}
              {deliveryLabel(deal.delivery) && ` · ${deliveryLabel(deal.delivery)}`}
            </p>
            {otherSellers.length > 0 && (
              <p>
                {otherSellers.length === 1
                  ? `Also offered by ${otherSellers[0].sellerName}`
                  : `Also offered by ${otherSellers.length} other sellers`}
              </p>
            )}
          </div>
          <div className="mt-3 [&_.btn]:min-h-[2.875rem] [&_.btn]:text-[14.5px]">
            <ContactActionsCompact deal={deal} />
          </div>
          {/* Wraps onto two left-aligned lines when the card is too narrow
              for the compare toggle and the details link side by side. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
            {onToggleCompare ? (
              <label className="compare-toggle">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={!!compareSelected}
                  disabled={compareDisabled && !compareSelected}
                  onChange={onToggleCompare}
                />
                {compareSelected ? "Added to compare" : "Compare"}
              </label>
            ) : (
              <span />
            )}
            <Link
              href={detailHref}
              onClick={() => markDealViewed(deal.id)}
              className="link-arrow min-h-0 pointer-coarse:py-2"
            >
              View details <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

// "EV" reads as "Electric" in a label; the rest are already words.
function fuelLabel(fuel: Deal["fuel"]) {
  if (!fuel) return null;
  return fuel === "EV" ? "Electric" : fuel === "PHEV" ? "Plug-in hybrid" : fuel;
}
