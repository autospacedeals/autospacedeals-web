// The full deal detail layout (photos, payment breakdown, vehicle details,
// contact card, similar deals) — shared between the public listing page
// (app/deals/[slug]/page.tsx) and the broker-only draft preview
// (app/broker/preview/[id]/page.tsx) so a broker can see exactly what
// shoppers will see before confirming & publishing a draft, without
// duplicating this whole layout in two places and letting them drift.
import { deliveryLabel } from "@/lib/deal-location";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Flag, CircleAlert, MessageSquare } from "lucide-react";
import PaymentEstimator from "@/components/PaymentEstimator";
import DealPhotoGallery from "@/components/DealPhotoGallery";
import type { Deal } from "@/lib/deals-data";
import {
  dealTitle,
  displayMsrp,
  effectiveMonthly,
  formatCurrency,
  isNewlyPosted,
  msrpDiscountPercent,
  reportIssueMailtoHref,
  formatMileage,
  formatTerm,
  formatMsds,
} from "@/lib/deal-utils";
import { ContactActionsFull } from "@/components/ContactActions";
import { ContactSellerButton } from "@/components/ContactSellerDialog";
import DealCard, { BADGE_STYLES } from "@/components/DealCard";
import { RatingBadge } from "@/components/StarRating";
import SaveDealButton from "@/components/SaveDealButton";
import type { BrokerRatingSummary } from "@/lib/supabase/reviews";

// Up to two initials for the seller avatar in the contact card. Guarded like
// every other deal-derived value below — a missing name just renders an
// empty avatar instead of throwing.
function initials(label: string | null | undefined) {
  return String(label ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

export default function DealDetailView({
  deal,
  similar = [],
  backHref = "/#deals",
  backLabel = "Back to all deals",
  // A draft preview isn't public yet — reporting it as inaccurate, or
  // letting a shopper's "contact seller" click go out for a listing that
  // doesn't really exist yet, doesn't make sense until it's published.
  isPreview = false,
  previewBanner,
  // The seller's average customer rating (lib/supabase/reviews.ts). Optional
  // — left out (or null) whenever it isn't known, e.g. in the broker preview
  // or before the reviews migration has been run — and only shown once the
  // seller has at least one review.
  brokerRating = null,
  // Whether saved searches exist yet (supabase/migrations/0017), so "Get
  // matched" can offer an alert for new matches. Off unless the page
  // checked.
  alertsAvailable = false,
}: {
  deal: Deal;
  similar?: Deal[];
  backHref?: string;
  backLabel?: string;
  isPreview?: boolean;
  previewBanner?: ReactNode;
  brokerRating?: BrokerRatingSummary | null;
  alertsAvailable?: boolean;
}) {
  // Every value derived from the deal is computed defensively — a single
  // bad field (a stray null slipping through a type that assumes it can't
  // happen, a malformed packages entry, etc.) shouldn't be able to take
  // down the whole page for every listing from one broker.
  let discount = 0;
  try {
    discount = msrpDiscountPercent(deal);
  } catch (err) {
    console.error("DealDetailView: msrpDiscountPercent failed for", deal.id, err);
  }
  const packages = Array.isArray(deal.packages)
    ? deal.packages.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  const headline = formatCurrency(deal.onePay ? deal.dueAtSigning : deal.payment);
  const sellerRating =
    deal.brokerId && brokerRating && brokerRating.count > 0 && brokerRating.average != null
      ? { average: brokerRating.average, count: brokerRating.count }
      : null;

  return (
    <main className="container-page max-w-6xl pt-8 pb-12 sm:pt-12">
      {previewBanner}

      <Link href={backHref} className="link-arrow mb-6 min-h-9">
        <ArrowLeft /> {backLabel}
      </Link>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left column: photo + details */}
        <div className="min-w-0">
          <DealPhotoGallery images={deal.images} alt={dealTitle(deal)}>
            {/* When a condition tag sits top-right, stop the left tags short of
                it so they wrap instead of running underneath it on phones. */}
            <div className={`absolute top-4 left-4 flex flex-wrap gap-2 ${deal.condition ? "right-24" : "right-4"}`}>
              {isNewlyPosted(deal) && (
                <span className="tag">
                  <span className="tag-dot" /> Just listed
                </span>
              )}
              {deal.badge && BADGE_STYLES[deal.badge] && <span className="tag">{deal.badge}</span>}
              {!deal.inStock && (
                <span className="tag">
                  <span className="tag-dot tag-dot-warning" /> Pending · call to confirm
                </span>
              )}
            </div>
            {deal.condition && <span className="tag absolute top-4 right-4">{deal.condition}</span>}
            {deal.sample ? (
              <p className="media-note media-note-warning pb-3 text-xs">
                <CircleAlert /> Sample listing — photo is a stock image, not the exact vehicle
              </p>
            ) : (
              deal.photoAutoSourced && (
                <p className="media-note pb-3 text-xs">
                  <CircleAlert /> Stock photo — may not be the exact vehicle
                </p>
              )
            )}
          </DealPhotoGallery>

          <div className="mt-8">
            <p className="label">{[deal.dealType, deal.fuel, deal.bodyStyle].filter(Boolean).join(" · ")}</p>
            {/* Save sits beside the title rather than on the photo, whose
                corners already carry the tags. Icon-only on phones. Not
                offered on a broker's draft preview. */}
            <div className="mt-2 flex items-start justify-between gap-4">
              <h1 className="type-page min-w-0 text-3xl sm:text-4xl">{dealTitle(deal)}</h1>
              {!isPreview && <SaveDealButton dealId={deal.id} variant="labeled" />}
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
              <MapPin size={15} className="text-fg-faint" /> {deal.city}, {deal.state}
              {deliveryLabel(deal.delivery) && <span className="text-fg-faint">· {deliveryLabel(deal.delivery)}</span>}
            </p>
          </div>

          <section className="panel mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="type-title">Payment breakdown</h2>
              <p className="text-xs text-fg-muted">Advertised by the seller</p>
            </div>

            {/* Key figures: always three cells */}
            <dl className="spec-grid mt-5 sm:grid-cols-3">
              <KeyFigure
                className="col-span-2 sm:col-span-1"
                label={deal.onePay ? "One-pay lease total" : "Monthly payment"}
                value={headline}
                unit={deal.onePay ? undefined : deal.paymentTaxRate ? "/mo" : "/mo + tax"}
                note={!deal.onePay && deal.paymentTaxRate ? `Includes ~${deal.paymentTaxRate}% tax` : undefined}
              />
              <KeyFigure
                label="Due at signing"
                value={formatCurrency(deal.dueAtSigning)}
                note={deal.dueAtSigningTaxRate ? `Assumes ${deal.dueAtSigningTaxRate}% tax` : undefined}
              />
              <KeyFigure label="Term" value={formatTerm(deal.term)} />
            </dl>

            {/* Everything else as statement rows */}
            <dl className="statement mt-2">
              {deal.brokerFee != null && (
                <Row label="Broker fee" note="Separate from due at signing" value={formatCurrency(deal.brokerFee)} />
              )}
              {deal.msdCount ? (
                <Row
                  label="Multiple security deposits"
                  note="The payment assumes these. Paid at signing on top of due at signing, refunded at lease end"
                  value={formatMsds(deal.msdCount, deal.msdTotal)}
                />
              ) : null}
              <Row label="MSRP" value={displayMsrp(deal)} />
              {deal.sellingPrice != null && <Row label="Selling price" value={formatCurrency(deal.sellingPrice)} />}
              {discount > 0 && <Row label="Discount off MSRP" value={`${discount.toFixed(1)}%`} positive />}
              {deal.milesPerYear ? (
                <Row
                  label="Mileage allowance"
                  value={formatMileage(deal.milesPerYear)}
                  note={`Contact ${deal.sellerName} for more/less mileage`}
                />
              ) : (
                <Row label="Mileage allowance" value="Not specified" />
              )}
              {deal.apr != null && <Row label="APR" value={`${deal.apr}%`} />}
            </dl>

            <div className="callout mt-5 flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-sm">
                <p className="text-sm font-semibold text-fg">Effective Payment</p>
                <p className="mt-1 text-[13px] leading-5 text-fg-secondary">
                  (total monthly payments + due at signing) / lease term — a fair way to compare
                  deals with different upfront amounts.
                </p>
              </div>
              <p className="flex items-baseline gap-1.5">
                <span className="price">{formatCurrency(effectiveMonthly(deal))}</span>
                <span className="price-unit">/mo effective</span>
              </p>
            </div>
          </section>

          <PaymentEstimator deal={deal} />

          <section className="panel mt-6">
            <h2 className="type-title">Vehicle details</h2>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {deal.exterior && <Detail label="Exterior" value={deal.exterior} />}
              {deal.interior && <Detail label="Interior" value={deal.interior} />}
              {deal.fuel && <Detail label="Fuel type" value={deal.fuel} />}
              {deal.bodyStyle && <Detail label="Body style" value={deal.bodyStyle} />}
            </dl>

            {packages.length > 0 && (
              <div className="mt-6">
                <p className="label">Packages</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {packages.map((item) => (
                    // Package names are free text from the seller: let a long
                    // one wrap (same 20px height on one line) instead of
                    // .pill's nowrap pushing the page wider than the phone.
                    <span key={item} className="pill pill-neutral max-w-full py-0.5 leading-4 break-words whitespace-normal">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="panel mt-6">
            <h2 className="type-title">Description</h2>
            <p className="mt-3 text-[15px] leading-7 break-words text-fg-secondary">{deal.notes}</p>
          </section>

          <div className="alert alert-warning mt-6">
            <CircleAlert />
            <p>
              This deal is subject to availability and credit approval.{" "}
              {deal.brokerFee != null
                ? "The broker fee shown above is separate from the due-at-signing amount."
                : "A broker fee may apply and isn't included in the due-at-signing amount shown."}{" "}
              {deal.msdCount
                ? `The payment assumes ${deal.msdCount} multiple security deposit${deal.msdCount === 1 ? "" : "s"}${
                    deal.msdTotal ? ` (${formatCurrency(deal.msdTotal)})` : ""
                  }, paid at signing in addition to the due-at-signing amount and refunded at the end of the lease.`
                : ""}{" "}
              Advertised payment amounts usually do not include tax. Title, registration, and
              documentation fees are included in the due-at-signing amount, but that total may
              change based on the actual tax rate applied. Always confirm the full, out-the-door
              total directly with {deal.sellerName} before signing.
            </p>
          </div>

          {!isPreview && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium">
              <a href={reportIssueMailtoHref(deal)} className="link-quiet inline-flex min-h-9 items-center gap-2">
                <Flag size={15} /> Report inaccurate deal
              </a>

              {deal.sourceUrl && (
                <a
                  href={deal.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-quiet inline-flex min-h-9 items-center underline decoration-dotted underline-offset-4"
                >
                  View original posting
                </a>
              )}
            </div>
          )}
        </div>

        {/* Right column: contact card (repeats the headline numbers so the
            price and the Call button stay in view while scrolling) */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card relative overflow-hidden">
            <div aria-hidden="true" className="light-bar absolute inset-x-0 top-0" />
            <div className="p-6">
              <p className="label">{deal.onePay ? "One-pay lease total" : "Monthly payment"}</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                <span className="price-lg">{headline}</span>
                {!deal.onePay && (
                  <span className="price-unit text-base">/mo{deal.paymentTaxRate ? "" : " + tax"}</span>
                )}
              </p>
              <p className="mt-3 text-sm text-fg-secondary">
                {!deal.onePay && `${formatCurrency(deal.dueAtSigning)} due at signing · `}
                {formatTerm(deal.term)}
                {deal.milesPerYear ? ` · ${formatMileage(deal.milesPerYear)}` : ""}
              </p>
            </div>

            <div className="border-t border-line p-6">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="avatar">
                  {initials(deal.sellerName)}
                </span>
                <div className="min-w-0">
                  <p className="label">{deal.sellerType}</p>
                  {deal.brokerId ? (
                    <Link
                      href={`/brokers/${deal.brokerId}`}
                      className="mt-0.5 block font-semibold text-fg transition-colors hover:text-accent-fg"
                    >
                      {deal.sellerName}
                    </Link>
                  ) : (
                    <p className="mt-0.5 font-semibold text-fg">{deal.sellerName}</p>
                  )}
                  {deal.sellerDealership && <p className="text-sm text-fg-muted">at {deal.sellerDealership}</p>}
                  <p className="mt-1 text-sm text-fg-muted">
                    {deal.city}, {deal.state}
                  </p>
                  {/* Its own line, so the inline badge and the inline
                      "View seller profile" link below don't run together. */}
                  {sellerRating && (
                    <div className="mt-1">
                      <RatingBadge
                        href={`/brokers/${deal.brokerId}#reviews`}
                        average={sellerRating.average}
                        count={sellerRating.count}
                      />
                    </div>
                  )}
                  {deal.brokerId && (
                    <Link href={`/brokers/${deal.brokerId}`} className="link-arrow mt-2 min-h-9">
                      View seller profile <ArrowRight />
                    </Link>
                  )}
                </div>
              </div>
              <div className="mt-5">
                {/* "Get matched" emails the same similar deals shown at the
                    bottom of this page — their ids, not a fresh lookup. */}
                <ContactActionsFull
                  deal={deal}
                  similarIds={similar.map((d) => d.id)}
                  alertsAvailable={alertsAvailable}
                  preview={isPreview}
                />
              </div>
            </div>

            <p className="border-t border-line px-6 py-4 text-xs leading-5 text-fg-muted">
              Contacting the seller connects you directly — Drive does not process
              payments or negotiate on your behalf.
            </p>
          </div>
        </aside>
      </div>

      {/* Similar deals */}
      {similar.length > 0 && (
        <section className="mt-20 border-t border-line pt-12">
          <h2 className="type-section mb-8">Similar deals</h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {similar.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}

      {/* Phones/tablets: price + Message seller stay reachable. Sticky (not fixed)
          at the end of <main>, so it scrolls away before the footer. */}
      {!isPreview && (
        <div className="sticky bottom-0 z-40 -mx-4 mt-10 border-t border-line bg-canvas/90 backdrop-blur-xl sm:-mx-6 lg:hidden">
          <div aria-hidden="true" className="light-bar absolute inset-x-0 top-0" />
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1">
                <span className="price text-xl">{headline}</span>
                {!deal.onePay && <span className="price-unit">/mo</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {deal.onePay ? "One-pay total" : `${formatCurrency(deal.dueAtSigning)} due`} · {formatTerm(deal.term)}
              </p>
            </div>
            <ContactSellerButton deal={deal} kind="message" className="btn btn-primary btn-sm">
              <MessageSquare /> Message seller
            </ContactSellerButton>
          </div>
        </div>
      )}
    </main>
  );
}

function KeyFigure({
  label,
  value,
  unit,
  note,
  className = "",
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`spec p-4 ${className}`}>
      <dt className="spec-label">{label}</dt>
      <dd className="mt-2 flex flex-wrap items-baseline gap-x-1">
        <span className="stat-value whitespace-nowrap max-sm:text-xl">{value}</span>
        {unit && <span className="price-unit">{unit}</span>}
      </dd>
      {note && <dd className="spec-note mt-1">{note}</dd>}
    </div>
  );
}

function Row({ label, value, note, positive }: { label: string; value: string; note?: string; positive?: boolean }) {
  return (
    <div className="statement-row">
      <dt>
        {label}
        {note && <span className="mt-0.5 block text-xs text-fg-muted">{note}</span>}
      </dt>
      <dd className={positive ? "text-success" : undefined}>{value}</dd>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}
