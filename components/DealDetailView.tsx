// The full deal detail layout (photos, payment breakdown, vehicle details,
// contact card, similar deals) — shared between the public listing page
// (app/deals/[slug]/page.tsx) and the broker-only draft preview
// (app/broker/preview/[id]/page.tsx) so a broker can see exactly what
// shoppers will see before confirming & publishing a draft, without
// duplicating this whole layout in two places and letting them drift.
import { deliveryLabel } from "@/lib/deal-location";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Flag, CircleAlert } from "lucide-react";
import PaymentEstimator from "@/components/PaymentEstimator";
import DealPhotoGallery from "@/components/DealPhotoGallery";
import type { Deal } from "@/lib/deals-data";
import {
  dealTitle,
  displayMsrp,
  formatCurrency,
  isNewlyPosted,
  msrpDiscountPercent,
  realMonthlyCost,
  reportIssueMailtoHref,
  formatMsds,
  hasOtherMileages,
  otherTermsNote,
} from "@/lib/deal-utils";
import { isRequiredProgram } from "@/lib/deal-options";
import { TOTAL_PRICE_LABEL, TOTAL_PRICE_NOTE, TOTAL_PRICE_SUFFIX } from "@/lib/cars-act";
import { ContactActionsFull } from "@/components/ContactActions";
import { ContactSellerButton } from "@/components/ContactSellerDialog";
import DealCard, { BADGE_STYLES } from "@/components/DealCard";
import { RatingBadge } from "@/components/StarRating";
import SaveDealButton from "@/components/SaveDealButton";
import DealBackLinks from "@/components/DealBackLinks";
import { DealTaxBox } from "@/components/TaxRate";
import type { BrokerRatingSummary } from "@/lib/supabase/reviews";
import SellerAvatar from "@/components/SellerAvatar";
import { modelPath } from "@/lib/lease-pages";


export default function DealDetailView({
  deal,
  similar = [],
  // Left out on the public deal page, which offers "Back to your search"
  // when the shopper came from a filtered list (DealBackLinks).
  backHref,
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
  // The same deal listed by other sellers (lib/deal-utils.ts sameDealKey),
  // lowest broker fee first.
  sameDeals = [],
  // The seller's logo, shown instead of their initials (null: none).
  sellerLogo = null,
}: {
  deal: Deal;
  similar?: Deal[];
  sameDeals?: Deal[];
  backHref?: string;
  backLabel?: string;
  isPreview?: boolean;
  previewBanner?: ReactNode;
  brokerRating?: BrokerRatingSummary | null;
  alertsAvailable?: boolean;
  sellerLogo?: string | null;
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
  const requires = (deal.incentives ?? []).filter(isRequiredProgram);
  // Real monthly cost (lib/deal-utils.ts realMonthlyCost): the due at
  // signing and any listed broker fee spread over the lease, the first
  // payment inside the due when it covers it. With MSDs as an option, the
  // same at the lower payment (the deposits come back, so they're left out).
  const term = deal.term > 0 ? deal.term : 1;
  const laterPayments = deal.dueAtSigning >= deal.payment ? term - 1 : term;
  const fee = deal.brokerFee != null && deal.brokerFee > 0 ? deal.brokerFee : 0;
  const real = deal.onePay ? (deal.dueAtSigning + fee) / term : realMonthlyCost(deal);
  const realWithMsds =
    !deal.onePay && deal.msdPayment && deal.msdCount
      ? (deal.dueAtSigning + deal.msdPayment * (deal.dueAtSigning >= deal.msdPayment ? term - 1 : term) + fee) / term
      : null;
  const feeTerm = fee ? ` + ${formatCurrency(fee)} broker fee` : "";
  const sellerRating =
    deal.brokerId && brokerRating && brokerRating.count > 0 && brokerRating.average != null
      ? { average: brokerRating.average, count: brokerRating.count }
      : null;

  return (
    <main className="container-page pt-6 pb-12 sm:pt-10">
      {previewBanner}

      {backHref ? (
        <Link href={backHref} className="link-arrow mb-6 min-h-9">
          <ArrowLeft /> {backLabel}
        </Link>
      ) : (
        <DealBackLinks />
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-14">
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
            {deal.sample && (
              <p className="media-note media-note-warning pb-3 text-xs">
                <CircleAlert /> Sample listing — photo is a stock image, not the exact vehicle
              </p>
            )}
          </DealPhotoGallery>

          <div className="mt-8">
            <p className="label">{[deal.dealType, deal.fuel, deal.bodyStyle].filter(Boolean).join(" · ")}</p>
            {/* Save sits beside the title rather than on the photo, whose
                corners already carry the tags. Icon-only on phones. Not
                offered on a broker's draft preview. */}
            <div className="mt-2 flex items-start justify-between gap-4">
              <h1 className="type-page min-w-0 text-4xl sm:text-[3.5rem]">
                {deal.year} {deal.make} {deal.model}
                {deal.trim ? <em> {deal.trim}</em> : null}
              </h1>
              {!isPreview && <SaveDealButton dealId={deal.id} variant="labeled" />}
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
              <MapPin size={15} className="text-fg-faint" /> {deal.city}, {deal.state}
              {deliveryLabel(deal.delivery) && <span className="text-fg-faint">· {deliveryLabel(deal.delivery)}</span>}
            </p>
            {!isPreview && deal.make && deal.model && (
              <Link href={modelPath(deal.make, deal.model)} className="link-arrow mt-2 inline-flex text-sm">
                More {deal.make} {deal.model} lease deals <ArrowRight />
              </Link>
            )}
          </div>

          {/* Level 1: the offer — the payment, what's due, the term and miles,
              every condition that changes the price, and (when MSDs are an
              option) the two ways to pay. */}
          <section aria-label="The offer" className="mt-10 border-t border-rule-ink pt-5">
            <p className="label">{deal.onePay ? "One-pay lease total" : "Monthly payment"}</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
              <span className="price-lg text-[3.25rem] sm:text-[4rem]">{headline}</span>
              {!deal.onePay && (
                <span className="price-unit text-lg">
                  {deal.paymentTaxRate ? `/mo (incl. ~${deal.paymentTaxRate}% tax)` : "/mo + tax"}
                </span>
              )}
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {!deal.onePay && (
                <Fact
                  className="col-span-2 sm:col-span-1"
                  label="Due at signing"
                  value={formatCurrency(deal.dueAtSigning)}
                  note={[
                    deal.dueAtSigning >= deal.payment ? "Includes the first month’s payment." : null,
                    deal.dueAtSigningTaxRate ? `Assumes ${deal.dueAtSigningTaxRate}% tax.` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              )}
              <Fact
                label={deal.dealType === "Finance" ? "Term" : "Lease length"}
                value={`${deal.term} months`}
                note={otherTermsNote(deal) ? `Priced ${otherTermsNote(deal)} too; see the estimate below.` : undefined}
              />
              <Fact
                label="Miles a year"
                value={deal.milesPerYear ? deal.milesPerYear.toLocaleString("en-US") : "Not specified"}
                note={
                  hasOtherMileages(deal)
                    ? "Other mileages are priced too; see the estimate below."
                    : `Ask ${deal.sellerName} about more or fewer miles.`
                }
              />
            </dl>

            {/* Anything the shopper has to know before counting on the price. */}
            <ul aria-label="Before you count on this price" className="mt-6 space-y-2 border-l-2 border-brand bg-surface px-[18px] py-4 text-[14.5px] leading-normal text-fg-secondary [&_strong]:font-semibold [&_strong]:text-fg">
              {requires.length > 0 && (
                <li>
                  <strong>Requires {requires.map((i) => i.name).join(" & ")} eligibility.</strong> This price is for
                  shoppers who qualify. {deal.sellerName} confirms it with you.
                </li>
              )}
              {deal.brokerFee != null && (
                <li>
                  <strong>Broker fee: {formatCurrency(deal.brokerFee)}</strong>, paid to {deal.sellerName} on top of the
                  due at signing.
                </li>
              )}
              {deal.msdCount && !deal.msdPayment ? (
                <li>
                  <strong>The payment assumes {formatMsds(deal.msdCount, deal.msdTotal)}</strong>, paid at signing on
                  top of the due at signing and refunded at the end of the lease.
                </li>
              ) : null}
              <li>
                <strong>{deal.paymentTaxRate ? `Includes about ${deal.paymentTaxRate}% sales tax.` : "Plus sales tax"}</strong>
                {deal.paymentTaxRate ? "" : " on the monthly payment."} Credit approval required.
              </li>
            </ul>

            {/* MSDs as an option: two clearly separate ways to pay, so the
                lower payment can't be read as the advertised one. */}
            {!deal.onePay && deal.msdPayment && deal.msdCount ? (
              <div className="mt-6">
                <p className="label">Two ways to pay</p>
                <div className="mt-2.5 grid gap-3.5 sm:grid-cols-2">
                  <PayOption
                    selected
                    title="Standard (the advertised price)"
                    payment={formatCurrency(deal.payment)}
                    note={`${formatCurrency(deal.dueAtSigning)} due at signing`}
                  />
                  <PayOption
                    title="With refundable deposits"
                    payment={formatCurrency(deal.msdPayment)}
                    note={
                      deal.msdTotal
                        ? `${formatCurrency(deal.dueAtSigning)} due + ${formatCurrency(deal.msdTotal)} in deposits (${formatCurrency(deal.dueAtSigning + deal.msdTotal)} at signing)`
                        : `${formatCurrency(deal.dueAtSigning)} due + ${deal.msdCount} deposit${deal.msdCount === 1 ? "" : "s"}`
                    }
                  />
                </div>
                <p className="mt-3 font-serif text-[15.5px] leading-normal text-fg-secondary">
                  <strong className="font-display text-sm font-semibold text-fg">
                    Refundable security deposits (MSDs)
                  </strong>{" "}
                  are money you hand over at signing and get back when the lease ends in good standing. Paying them
                  lowers the monthly payment. They’re optional, and they aren’t part of the{" "}
                  {formatCurrency(deal.dueAtSigning)} due at signing.
                </p>
              </div>
            ) : null}
          </section>

          {/* Level 2: the full breakdown, each part in its own section that
              opens. */}
          <section aria-label="The full breakdown" className="mt-14 border-t border-rule-ink pt-3.5">
            <h2 className="dp-h2">The full breakdown</h2>
            <p className="mt-1.5 mb-2.5 font-serif text-base text-fg-secondary">
              Everything that makes up this offer, for when you want the detail. Nothing here changes the price above.
            </p>

            <Acc
              open
              title="What you pay, and when"
              summary={
                deal.onePay
                  ? `${headline} at signing`
                  : `${formatCurrency(deal.dueAtSigning)}${deal.brokerFee ? ` + ${formatCurrency(deal.brokerFee)}` : ""} at signing`
              }
            >
              <dl className="statement">
                <Row
                  label={deal.onePay ? "One-pay lease total" : "Due at signing"}
                  note={
                    deal.onePay
                      ? "The whole lease, paid when you sign."
                      : `Paid when you sign.${deal.dueAtSigning >= deal.payment ? " Includes the first month’s payment." : ""}`
                  }
                  value={formatCurrency(deal.dueAtSigning)}
                />
                {deal.brokerFee != null && (
                  <Row
                    label="Broker fee"
                    note={`${deal.sellerName}’s fee for arranging the lease, paid separately.`}
                    value={formatCurrency(deal.brokerFee)}
                  />
                )}
                {!deal.onePay && (
                  <Row
                    label="Monthly payment"
                    note={`${laterPayments} ${deal.dueAtSigning >= deal.payment ? "more payments after the first" : "monthly payments"}${deal.paymentTaxRate ? `, including about ${deal.paymentTaxRate}% tax` : ", plus sales tax"}.`}
                    value={formatCurrency(deal.payment)}
                  />
                )}
                {deal.msdCount ? (
                  <Row
                    label={deal.msdPayment ? "Refundable deposits (optional)" : "Refundable deposits"}
                    note={
                      deal.msdPayment
                        ? `Only if you choose the lower ${formatCurrency(deal.msdPayment)}/mo payment. Returned at lease end.`
                        : "The payment assumes these. Paid at signing, returned at lease end."
                    }
                    value={formatMsds(deal.msdCount, deal.msdTotal)}
                  />
                ) : null}
                {deal.sellingPrice != null && (
                  <Row label={TOTAL_PRICE_LABEL} note={TOTAL_PRICE_NOTE} value={formatCurrency(deal.sellingPrice)} />
                )}
                <Row label="MSRP" value={displayMsrp(deal)} />
                {discount > 0 && <Row label="Discount off MSRP" value={`${discount.toFixed(1)}%`} positive />}
                {deal.apr != null && <Row label="APR" value={`${deal.apr}%`} />}
              </dl>
            </Acc>

            <Acc title="Real monthly cost" summary={`About ${formatCurrency(real)}/mo`}>
              <p className="acc-p">
                {deal.onePay ? (
                  <>
                    The one payment{fee ? " and the broker fee" : ""} spread over the lease: {fee ? "(" : ""}
                    {headline}
                    {fee ? `${feeTerm})` : ""} ÷ {deal.term} months ≈ <strong>{formatCurrency(real)} a month</strong>.
                  </>
                ) : (
                  <>
                    The due at signing{fee ? " and the broker fee" : ""} spread over the whole lease, so you can compare
                    deals with different upfront amounts: ({formatCurrency(deal.dueAtSigning)} +{" "}
                    {formatCurrency(deal.payment)} × {laterPayments}
                    {feeTerm}) ÷ {deal.term} months ≈ <strong>{formatCurrency(real)} a month</strong>.
                    {realWithMsds != null &&
                      ` With the refundable deposits it’s about ${formatCurrency(realWithMsds)} a month, since the deposits come back.`}
                  </>
                )}{" "}
                {!fee && deal.sellerType === "Broker"
                  ? `No broker fee is listed, so none is counted; ask ${deal.sellerName} what it is. `
                  : ""}
                Taxes aren’t included.
              </p>
            </Acc>

            {requires.length > 0 && (
              <Acc title={`Eligibility: ${requires.map((i) => i.name).join(" & ")}`} summary="Must qualify">
                <p className="acc-p">
                  Brands lower some lease prices for shoppers in a program, such as <strong>loyalty</strong> (usually
                  you already own or lease one of their cars) or <strong>corporate</strong> (you work for a company in
                  their program). This price needs {requires.length === 1 ? "this one" : "these"}:{" "}
                  <strong>{requires.map((i) => i.name).join(" & ")}</strong>. Ask {deal.sellerName} what proof they
                  need; without it the payment will be different.
                </p>
              </Acc>
            )}

            <Acc title="Estimate a different payment" summary="Calculator">
              <PaymentEstimator deal={deal} embedded />
            </Acc>

            <Acc
              title="Vehicle details"
              summary={[deal.condition, deal.fuel === "EV" ? "Electric" : deal.fuel, deal.bodyStyle].filter(Boolean).join(" · ")}
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {deal.condition && <Detail label="Condition" value={deal.condition} />}
                {deal.exterior && <Detail label="Exterior" value={deal.exterior} />}
                {deal.interior && <Detail label="Interior" value={deal.interior} />}
                {deal.fuel && <Detail label="Fuel type" value={deal.fuel} />}
                {deal.bodyStyle && <Detail label="Body style" value={deal.bodyStyle} />}
                <Detail label="MSRP" value={displayMsrp(deal)} />
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
            </Acc>

            {deal.notes && (
              <Acc title="From the seller" summary="Notes">
                <p className="font-serif text-lg leading-[1.6] break-words whitespace-pre-line text-fg-secondary">
                  {deal.notes}
                </p>
              </Acc>
            )}
          </section>

          <div className="alert mt-10 border-0 border-l-2 border-brand bg-hover-strong text-[13px] text-fg-secondary [&>svg]:text-brand">
            <CircleAlert />
            <p>
              This deal is subject to availability and credit approval.{" "}
              {deal.brokerFee != null
                ? "The broker fee shown above is separate from the due-at-signing amount."
                : "A broker fee may apply and isn't included in the due-at-signing amount shown."}{" "}
              {deal.msdCount
                ? `${
                    deal.msdPayment
                      ? `The ${formatCurrency(deal.msdPayment)}/mo payment assumes`
                      : "The payment assumes"
                  } ${deal.msdCount} multiple security deposit${deal.msdCount === 1 ? "" : "s"}${
                    deal.msdTotal ? ` (${formatCurrency(deal.msdTotal)})` : ""
                  }, paid at signing in addition to the due-at-signing amount and refunded at the end of the lease.`
                : ""}{" "}
              Advertised payment amounts usually do not include tax. Title, registration, and
              documentation fees are included in the due-at-signing amount, but that total may
              change based on the actual tax rate applied. Always confirm the full, out-the-door
              total directly with {deal.sellerName} before signing.
              {deal.photoAutoSourced ? " Photos are stock images of the model and may not show the exact vehicle." : ""}
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
          <div className="relative overflow-hidden rounded-[2px] border border-rule-ink">
            <div className="p-6">
              <p className="label">{deal.onePay ? "One-pay lease total" : "Monthly payment"}</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
                <span className="price-lg sm:text-[3.5rem]">{headline}</span>
                {!deal.onePay && (
                  <span className="price-unit text-base">/mo{deal.paymentTaxRate ? "" : " + tax"}</span>
                )}
              </p>
              <p className="mt-3 text-sm text-fg-secondary">
                {!deal.onePay && (
                  <>
                    <strong className="font-semibold text-fg">{formatCurrency(deal.dueAtSigning)}</strong> due at signing ·{" "}
                  </>
                )}
                {deal.term} months
                {deal.milesPerYear ? ` · ${deal.milesPerYear.toLocaleString("en-US")} mi/yr` : ""}
              </p>
              {(requires.length > 0 || deal.brokerFee != null) && (
                <p className="mt-2 text-[13px] font-semibold text-fg">
                  {[
                    requires.length > 0 ? `Requires ${requires.map((i) => i.name).join(" & ")} eligibility` : null,
                    deal.brokerFee != null ? `Broker fee ${formatCurrency(deal.brokerFee)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {!deal.onePay && deal.msdPayment && deal.msdCount ? (
                <p className="mt-1.5 text-[13px] text-fg-secondary">
                  Option: {formatCurrency(deal.msdPayment)}/mo
                  {deal.msdTotal ? ` with ${formatCurrency(deal.msdTotal)} in refundable deposits` : " with refundable deposits"}
                </p>
              ) : null}
              {/* With the signed-in shopper's sales tax (California ZIPs). */}
              <DealTaxBox deal={deal} />
              {deal.sellingPrice != null && (
                <p className="mt-1.5 text-sm text-fg-secondary">
                  {TOTAL_PRICE_LABEL} <strong className="font-semibold text-fg">{formatCurrency(deal.sellingPrice)}</strong>
                  <span className="text-fg-muted">{TOTAL_PRICE_SUFFIX}</span>
                </p>
              )}
            </div>

            <div className="border-t border-line p-6">
              <div className="flex items-start gap-3">
                <SellerAvatar name={deal.sellerName} logoUrl={sellerLogo} />
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
                  note="Ask about the deal, availability or eligibility."
                />
              </div>
            </div>

            {sameDeals.length > 0 && (
              <div className="border-t border-line p-6">
                <p className="label">Same deal, other sellers</p>
                <p className="mt-1 text-sm text-fg-muted">
                  {sameDeals.length === 1 ? "Another seller offers" : `${sameDeals.length} other sellers offer`} this
                  exact deal. Compare their broker fees and reviews.
                </p>
                <ul className="mt-4 space-y-3">
                  {sameDeals.map((d) => {
                    const diff = d.brokerFee != null && deal.brokerFee != null ? d.brokerFee - deal.brokerFee : null;
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 rounded-[3px] border border-line px-4 py-3">
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-medium text-fg">{d.sellerName}</p>
                          <p className="text-fg-muted">
                            {d.brokerFee != null ? `Broker fee ${formatCurrency(d.brokerFee)}` : "Broker fee not listed"}
                            {diff ? (
                              <span className={diff < 0 ? "text-success" : ""}>
                                {` · ${formatCurrency(Math.abs(diff))} ${diff < 0 ? "lower" : "higher"}`}
                              </span>
                            ) : diff === 0 ? (
                              " · same fee"
                            ) : null}
                          </p>
                        </div>
                        <Link href={`/deals/${d.slug}`} className="btn btn-secondary btn-sm shrink-0">
                          View
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="border-t border-line px-6 py-4 text-xs leading-5 text-fg-muted">
              Contacting the seller connects you directly — Drive does not process
              payments or negotiate on your behalf.
            </p>
          </div>
        </aside>
      </div>

      {/* Similar deals */}
      {similar.length > 0 && (
        <section className="mt-24">
          <h2 className="type-section mb-8 text-[2.5rem] sm:text-[3.5rem]">Similar deals</h2>
          <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
            {similar.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}

      {/* Phones/tablets: price + Message seller stay reachable. Sticky (not fixed)
          at the end of <main>, so it scrolls away before the footer. */}
      {!isPreview && (
        <div className="sticky bottom-0 z-40 -mx-4 mt-10 border-t border-rule-ink bg-canvas/95 backdrop-blur-xl sm:-mx-6 lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-1">
                <span className="price text-xl">{headline}</span>
                {!deal.onePay && <span className="price-unit">/mo</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {deal.onePay ? "One-pay total" : `${formatCurrency(deal.dueAtSigning)} due`} · {deal.term} mo
                {deal.milesPerYear ? ` · ${deal.milesPerYear.toLocaleString("en-US")} mi` : ""}
              </p>
            </div>
            <ContactSellerButton deal={deal} kind="message" className="btn btn-primary h-12 px-5">
              Message seller
            </ContactSellerButton>
          </div>
        </div>
      )}
    </main>
  );
}

function Fact({ label, value, note, className = "" }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div className={`border-t border-line pt-2.5 ${className}`}>
      <dt className="spec-label">{label}</dt>
      <dd className="mt-1.5 font-display text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] text-fg tabular-nums">
        {value}
      </dd>
      {note && <dd className="mt-1 font-serif text-[14.5px] leading-snug text-fg-secondary">{note}</dd>}
    </div>
  );
}

function PayOption({ title, payment, note, selected = false }: { title: string; payment: string; note: string; selected?: boolean }) {
  return (
    <div className={`border px-4 py-3.5 ${selected ? "border-fg" : "border-line-strong"}`}>
      <p className="text-[12.5px] font-semibold text-fg-secondary">{title}</p>
      <p className="mt-1.5 text-[15px] text-fg-muted">
        <span className="font-display text-[1.875rem] font-semibold tracking-[-0.02em] text-fg tabular-nums">{payment}</span> /mo
      </p>
      <p className="mt-0.5 text-[13px] text-fg-secondary">{note}</p>
    </div>
  );
}

// One part of the full breakdown: a row that opens, with a short value on
// the right (hidden on phones).
function Acc({ title, summary, open = false, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="acc" open={open}>
      <summary>
        <span>{title}</span>
        {summary && <span className="acc-v">{summary}</span>}
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

function Row({ label, value, note, positive }: { label: string; value: string; note?: string; positive?: boolean }) {
  return (
    <div className="statement-row">
      <dt>
        {label}
        {note && <span className="mt-0.5 block font-serif text-[14.5px] text-fg-muted italic">{note}</span>}
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
