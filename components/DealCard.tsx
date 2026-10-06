// Needs to be a Client Component: the onClick handlers below (markDealViewed)
// attach an event listener to <Link>. DealCard is rendered both from Client
// Components (the homepage grid) and true Server Components (the "Similar
// Deals" section on every /deals/[slug] page via DealDetailView) — without
// this directive, the Server Component render path crashes with "Event
// handlers cannot be passed to Client Component props" on every single deal
// page, since a Server Component can't hand a function prop to <Link>.
"use client";

import { deliveryLabel } from "@/lib/deal-location";
import { useId } from "react";
import Link from "next/link";
import { MapPin, ArrowRight, Store, CircleAlert } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import {
  displayMsrp,
  formatCurrency,
  isNewlyPosted,
  markDealViewed,
  msrpDiscountPercent,
  formatMileage,
  formatTerm,
  formatMsds,
  hasOtherMileages,
  otherTermsNote,
} from "@/lib/deal-utils";
import { isRequiredProgram } from "@/lib/deal-options";
import { ContactActionsCompact } from "./ContactActions";
import SaveDealButton, { useShowSaveDealButton } from "./SaveDealButton";

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
}: {
  deal: Deal;
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
  const title = `${deal.year} ${deal.make} ${deal.model}`;
  const showSave = useShowSaveDealButton(deal.id);
  const titleId = useId();

  return (
    <article className="card-interactive group flex h-full flex-col overflow-hidden">
      {/* Inset focus ring: the card clips overflow (rounded photo corners),
          which would otherwise hide most of this full-bleed link's outline. */}
      <Link
        href={detailHref}
        onClick={() => markDealViewed(deal.id)}
        className="block focus-visible:-outline-offset-2"
      >
        <div className="media-stage aspect-[4/3]">
          {/* Lazy: the homepage grid renders every deal at once, and these
              are full-size dealer/manufacturer photos (often 1–2 MB each). */}
          <img src={image} alt={title} loading="lazy" decoding="async" className="media-img" />

          {/* One row across the top: the left-hand tags wrap onto a second
              line before they can run underneath the condition tag. When
              the save heart is shown it has the top-right corner to itself:
              the row stops short of it (36px, or 44px on touch, plus the
              gap) and the condition tag joins the end of the left-hand
              group instead, wrapping as a whole tag, so the other tags keep
              the room they had. On touch the row also moves down with the
              heart (see below). */}
          <div
            className={`absolute top-3 left-3 flex items-start justify-between gap-2 ${
              showSave ? "right-14 pointer-coarse:top-4 pointer-coarse:right-16" : "right-3"
            }`}
          >
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {isNewlyPosted(deal) && (
                <span className="tag">
                  <span className="tag-dot" /> Just listed
                </span>
              )}
              {deal.badge && BADGE_STYLES[deal.badge] && (
                <span className={BADGE_STYLES[deal.badge]}>{deal.badge}</span>
              )}
              {!deal.inStock && (
                <span className="tag">
                  <span className="tag-dot tag-dot-warning" /> Pending · call to confirm
                </span>
              )}
              {showSave && deal.condition && <span className="tag">{deal.condition}</span>}
            </div>

            {!showSave && deal.condition && <span className="tag shrink-0">{deal.condition}</span>}
          </div>

          {deal.sample ? (
            <p className="media-note media-note-warning">
              <CircleAlert /> Sample listing — photo not exact vehicle
            </p>
          ) : (
            deal.photoAutoSourced && (
              <p className="media-note">Stock photo — may not be exact vehicle</p>
            )
          )}
        </div>

        <div className="px-5 pt-5">
          <p className="label">{[deal.dealType, deal.fuel].filter(Boolean).join(" · ")}</p>
          <h3 id={titleId} className="type-card mt-1.5">{title}</h3>
          {/* line-clamp, not truncate: nowrap text would set the card's
              min-content width and could push the phone grid wider than
              the screen on a long trim. */}
          {deal.trim && <p className="mt-0.5 line-clamp-1 text-sm text-fg-secondary">{deal.trim}</p>}
        </div>
      </Link>

      {/* Save heart over the photo's top-right corner. It sits outside the
          link (a button can't be nested in an <a>) and is centered on the
          tag row: 21px is a .tag's height. On touch the button grows to
          44px, so it and the row move down 4px to keep the circle (and its
          focus ring) clear of the card's top edge, as the 36px one is. */}
      {showSave && (
        <div className="absolute top-3 right-3 z-10 flex h-[21px] items-center pointer-coarse:top-4">
          <SaveDealButton dealId={deal.id} savedHint={savedHint} describedBy={titleId} />
        </div>
      )}

      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="label">{deal.onePay ? "One-pay lease total" : "Monthly payment"}</p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1">
              <span className="price">
                {formatCurrency(deal.onePay ? deal.dueAtSigning : deal.payment)}
              </span>
              {!deal.onePay && (
                <span className="price-unit">
                  /mo{deal.paymentTaxRate ? ` (incl. ~${deal.paymentTaxRate}% tax)` : " + tax"}
                </span>
              )}
            </p>
            {/* The vehicle's total price, when the seller gives it (required on
                dealership listings by California's CARS Act). */}
            {deal.sellingPrice != null && (
              <p className="mt-1 text-[13px] text-fg-secondary">
                Total price <strong className="font-semibold text-fg">{formatCurrency(deal.sellingPrice)}</strong>
                <span className="text-fg-muted"> + tax &amp; gov&apos;t fees</span>
              </p>
            )}
          </div>
          {discount > 0 && (
            <p className="shrink-0 pb-0.5 text-[13px] font-medium text-success">
              {discount.toFixed(0)}% off MSRP
            </p>
          )}
        </div>

        {/* Always exactly four cells (2 × 2) so every card's spec sheet is the
            same height; the optional broker fee is one fine-print line below. */}
        <dl className="spec-grid mt-4">
          <Spec
            label="Due at signing"
            value={formatCurrency(deal.dueAtSigning)}
            note={deal.dueAtSigningTaxRate ? `assumes ${deal.dueAtSigningTaxRate}% tax` : undefined}
          />
          <Spec label="Term" value={formatTerm(deal.term)} note={otherTermsNote(deal) ?? undefined} />
          <Spec
            label="Mileage"
            value={deal.milesPerYear ? formatMileage(deal.milesPerYear) : "N/A"}
            note={hasOtherMileages(deal) ? "other mileages too" : undefined}
          />
          <Spec label="MSRP" value={displayMsrp(deal)} />
        </dl>
        {deal.brokerFee != null && (
          <p className="spec-footnote mt-2">
            Broker fee <strong>{formatCurrency(deal.brokerFee)}</strong> · separate from due at
            signing
          </p>
        )}
        {deal.msdCount ? (
          <p className="spec-footnote mt-2">
            Payment assumes <strong>{formatMsds(deal.msdCount, deal.msdTotal)}</strong> · paid at
            signing
          </p>
        ) : null}
        {(deal.incentives ?? []).some(isRequiredProgram) && (
          <p className="spec-footnote mt-2">
            Price requires{" "}
            <strong>
              {(deal.incentives ?? [])
                .filter(isRequiredProgram)
                .map((i) => i.name)
                .join(" & ")}
            </strong>{" "}
            · must qualify
          </p>
        )}

        {/* Seller + actions are one unit anchored to the card bottom, so
            action rows line up across a grid row. */}
        <div className="mt-auto pt-5">
          <div className="space-y-1.5 border-t border-line pt-4 text-[13px] text-fg-muted">
            <p className="flex items-center gap-2">
              <MapPin size={14} className="shrink-0 text-fg-faint" /> {deal.city}, {deal.state}
              {deliveryLabel(deal.delivery) && <span className="text-fg-faint">· {deliveryLabel(deal.delivery)}</span>}
            </p>
            <p className="flex items-start gap-2">
              <Store size={14} className="mt-0.5 shrink-0 text-fg-faint" />
              <span>
                {deal.brokerId ? (
                  <Link
                    href={`/brokers/${deal.brokerId}`}
                    className="font-medium text-fg-secondary transition-colors hover:text-fg"
                  >
                    {deal.sellerName}
                  </Link>
                ) : (
                  <span className="font-medium text-fg-secondary">{deal.sellerName}</span>
                )}{" "}
                · {deal.sellerType}
                {deal.sellerDealership && ` at ${deal.sellerDealership}`}
              </span>
            </p>
          </div>

          <div className="mt-4">
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
                {compareSelected ? "Added to compare" : "Compare this deal"}
              </label>
            ) : (
              <span />
            )}
            <Link
              href={detailHref}
              onClick={() => markDealViewed(deal.id)}
              className="link-arrow min-h-9 pointer-coarse:min-h-11"
            >
              View full details <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function Spec({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="spec">
      <dt className="spec-label">{label}</dt>
      <dd className="spec-value">{value}</dd>
      {note && <dd className="spec-note">{note}</dd>}
    </div>
  );
}
