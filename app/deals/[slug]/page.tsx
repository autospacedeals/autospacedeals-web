import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Store,
  Flag,
  CircleAlert,
} from "lucide-react";
import PaymentEstimator from "@/components/PaymentEstimator";
import type { Deal } from "@/lib/deals-data";
import { getDealBySlugDb, getPublishedDeals } from "@/lib/supabase/deals";
import {
  dealTitle,
  displayMsrp,
  effectiveMonthly,
  formatCurrency,
  getSimilarDealsFrom,
  msrpDiscountPercent,
  relativeDatePosted,
  reportIssueMailtoHref,
} from "@/lib/deal-utils";
import { ContactActionsFull } from "@/components/ContactActions";
import DealCard, { HIDDEN_BADGES } from "@/components/DealCard";

// Always fetch fresh — a broker can edit/reprice/remove their own listing at
// any time, and the detail page should never show stale info.
export const dynamic = "force-dynamic";

const CONDITION_STYLES: Record<string, string> = {
  New: "bg-blue-500 text-white",
  CPO: "bg-emerald-500 text-white",
  Loaner: "bg-amber-500 text-zinc-950",
  Demo: "bg-amber-500 text-zinc-950",
  Used: "bg-zinc-700 text-white",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const deal = await getDealBySlugDb(slug);
  if (!deal) return { title: "Deal not found" };

  // generateMetadata runs as its own server function, separate from the page
  // component below — a throw here isn't caught by any try/catch inside
  // DealDetailPage, so it crashes the whole request on its own. Guard every
  // field access defensively rather than relying on the page body's fixes.
  try {
    const dealTypeLabel = (deal.dealType ?? "Lease").toLowerCase();
    const title = `${dealTitle(deal)} — ${formatCurrency(deal.payment)}/mo`;
    const description = `${dealTitle(deal)} in ${deal.city}, ${deal.state}: ${formatCurrency(
      deal.payment
    )}/mo, ${formatCurrency(deal.dueAtSigning)} due at signing, ${deal.term} month ${dealTypeLabel} from ${deal.sellerName}.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: deal.images && deal.images.length > 0 ? [{ url: deal.images[0] }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: deal.images && deal.images.length > 0 ? [deal.images[0]] : undefined,
      },
    };
  } catch (err) {
    console.error("generateMetadata failed for", deal.id, err);
    return { title: dealTitle(deal) || "Deal details" };
  }
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const deal = await getDealBySlugDb(slug);
  if (!deal) notFound();

  // Every value derived from the deal is computed up front, in one place,
  // wrapped defensively — a single bad field (a stray null slipping through
  // a type that assumes it can't happen, a malformed packages entry, etc.)
  // shouldn't be able to take down the whole page for every listing from
  // one broker. Falls back to safe defaults and logs the real error server
  // side instead of surfacing the generic error boundary.
  let discount = 0;
  let similar: Deal[] = [];
  try {
    discount = msrpDiscountPercent(deal);
  } catch (err) {
    console.error("DealDetailPage: msrpDiscountPercent failed for", deal.id, err);
  }
  try {
    const allDeals = await getPublishedDeals();
    similar = getSimilarDealsFrom(allDeals, deal, 3);
  } catch (err) {
    console.error("DealDetailPage: similar deals failed for", deal.id, err);
  }
  const packages = Array.isArray(deal.packages)
    ? deal.packages.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/#deals"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
      >
        <ArrowLeft size={16} /> Back to all deals
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        {/* Left column: photo + details */}
        <div>
          <div className="relative overflow-hidden rounded-3xl bg-zinc-900">
            <img
              src={deal.images[0]}
              alt={dealTitle(deal)}
              className="h-64 w-full object-cover sm:h-80 md:h-96"
            />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              {deal.badge && !HIDDEN_BADGES.has(deal.badge) && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-950">
                  {deal.badge}
                </span>
              )}
              {!deal.inStock && (
                <span className="rounded-full bg-zinc-950/90 px-3 py-1 text-xs font-bold text-zinc-300">
                  Pending / Call to confirm
                </span>
              )}
            </div>
            {deal.condition && (
              <span
                className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold ${
                  CONDITION_STYLES[deal.condition] ?? "bg-zinc-950/90 text-zinc-300"
                }`}
              >
                {deal.condition}
              </span>
            )}
            {deal.sample ? (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-amber-500/90 px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-950">
                <CircleAlert size={14} /> Sample listing — photo is a stock image, not the exact vehicle
              </span>
            ) : (
              deal.photoAutoSourced && (
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-zinc-950/85 px-3 py-2 text-xs font-semibold text-zinc-300">
                  <CircleAlert size={14} /> Stock photo — may not be the exact vehicle
                </span>
              )
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {[deal.dealType, deal.fuel, deal.bodyStyle].filter(Boolean).join(" · ")}
            </p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">{dealTitle(deal)}</h1>
            <p className="mt-2 flex items-center gap-2 text-zinc-400">
              <MapPin size={16} /> {deal.city}, {deal.state}
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <h2 className="text-lg font-bold">Payment Breakdown</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label={deal.onePay ? "One-pay lease total" : "Monthly payment"}
                value={
                  deal.onePay
                    ? formatCurrency(deal.dueAtSigning)
                    : `${formatCurrency(deal.payment)}/mo${deal.paymentTaxRate ? "" : " + tax"}`
                }
                note={
                  !deal.onePay && deal.paymentTaxRate
                    ? `Includes ~${deal.paymentTaxRate}% tax`
                    : undefined
                }
                big
              />
              <Stat
                label="Due at signing"
                value={formatCurrency(deal.dueAtSigning)}
                note={deal.dueAtSigningTaxRate ? `Assumes ${deal.dueAtSigningTaxRate}% tax` : undefined}
                big
              />
              <Stat label="Term" value={`${deal.term} months`} big />
              {deal.brokerFee != null && (
                <Stat
                  label="Broker fee"
                  value={formatCurrency(deal.brokerFee)}
                  note="Separate from due at signing"
                  big
                />
              )}
              <Stat label="MSRP" value={displayMsrp(deal)} />
              {deal.sellingPrice != null && (
                <Stat label="Selling price" value={formatCurrency(deal.sellingPrice)} />
              )}
              {discount > 0 && <Stat label="Discount off MSRP" value={`${discount.toFixed(1)}%`} />}
              {deal.milesPerYear ? (
                <Stat
                  label="Mileage allowance"
                  value={`${deal.milesPerYear.toLocaleString()}/yr`}
                  note={`Contact ${deal.sellerName} for more/less mileage`}
                />
              ) : (
                <Stat label="Mileage allowance" value="Not specified" />
              )}
              {deal.apr != null && <Stat label="APR" value={`${deal.apr}%`} />}
            </div>

            <div className="mt-5 rounded-xl bg-zinc-950 p-4 text-sm text-zinc-300">
              <p className="font-semibold text-white">Effective monthly cost</p>
              <p className="mt-1 text-zinc-400">
                Spreads due-at-signing across the term so you can compare deals with different
                upfront amounts fairly.
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {formatCurrency(effectiveMonthly(deal))}
                <span className="text-sm font-medium text-zinc-500">/mo effective</span>
              </p>
            </div>
          </div>

          <PaymentEstimator deal={deal} />

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <h2 className="text-lg font-bold">Vehicle Details</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-zinc-300 sm:grid-cols-3">
              {deal.exterior && <Detail label="Exterior" value={deal.exterior} />}
              {deal.interior && <Detail label="Interior" value={deal.interior} />}
              {deal.fuel && <Detail label="Fuel type" value={deal.fuel} />}
              {deal.bodyStyle && <Detail label="Body style" value={deal.bodyStyle} />}
              <Detail label="Posted" value={relativeDatePosted(deal.datePosted)} />
            </dl>

            {packages.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-zinc-400">Packages</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {packages.map((item) => (
                    <span key={item} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <h2 className="text-lg font-bold">Seller Notes</h2>
            <p className="mt-3 leading-7 text-zinc-300">{deal.notes}</p>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5 text-sm leading-6 text-amber-200/90">
            <CircleAlert size={18} className="mt-0.5 shrink-0" />
            <p>
              This deal is subject to availability and credit approval.{" "}
              {deal.brokerFee != null
                ? "The broker fee shown above is separate from the due-at-signing amount."
                : "A broker fee may apply and isn't included in the due-at-signing amount shown."}{" "}
              Advertised payment amounts usually do not include tax. Title, registration, and
              documentation fees are included in the due-at-signing amount, but that total may
              change based on the actual tax rate applied. Always confirm the full, out-the-door
              total directly with {deal.sellerName} before signing.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <a
              href={reportIssueMailtoHref(deal)}
              className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-white"
            >
              <Flag size={15} /> Report inaccurate deal
            </a>

            {deal.sourceUrl && (
              <a
                href={deal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-zinc-500 underline decoration-dotted transition hover:text-white"
              >
                View original posting
              </a>
            )}
          </div>
        </div>

        {/* Right column: contact card */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-400">
              <Store size={16} /> {deal.sellerType}
            </p>
            {deal.brokerId ? (
              <Link
                href={`/brokers/${deal.brokerId}`}
                className="mt-1 block text-xl font-black hover:underline"
              >
                {deal.sellerName}
              </Link>
            ) : (
              <p className="mt-1 text-xl font-black">{deal.sellerName}</p>
            )}
            {deal.sellerDealership && (
              <p className="text-sm text-zinc-400">at {deal.sellerDealership}</p>
            )}
            <p className="mt-1 text-sm text-zinc-500">
              {deal.city}, {deal.state} · {deal.sellerPhone}
            </p>
            {deal.brokerId && (
              <Link
                href={`/brokers/${deal.brokerId}`}
                className="mt-1 inline-block text-sm font-semibold text-zinc-400 underline decoration-dotted hover:text-white"
              >
                View seller profile
              </Link>
            )}
            <div className="mt-5 border-t border-white/10 pt-5">
              <ContactActionsFull deal={deal} />
            </div>

            <p className="mt-4 text-xs leading-5 text-zinc-500">
              Contacting the seller connects you directly — Drive does not process
              payments or negotiate on your behalf.
            </p>
          </div>
        </div>
      </div>

      {/* Similar deals */}
      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 text-2xl font-black">Similar Deals</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {similar.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  big,
  note,
}: {
  label: string;
  value: string;
  big?: boolean;
  note?: string;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={big ? "text-xl font-black" : "font-bold text-zinc-200"}>{value}</p>
      {note && <p className="text-[11px] text-zinc-600">{note}</p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-semibold text-zinc-200">{value}</dd>
    </div>
  );
}
