import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ShieldCheck,
  MapPin,
  Store,
  Flag,
  CircleAlert,
} from "lucide-react";
import { deals, getDealBySlug, getSimilarDeals } from "@/lib/deals-data";
import {
  dealTitle,
  effectiveMonthly,
  formatCurrency,
  msrpDiscountPercent,
  relativeDatePosted,
  reportIssueMailtoHref,
} from "@/lib/deal-utils";
import { ContactActionsFull } from "@/components/ContactActions";
import DealCard from "@/components/DealCard";

export async function generateStaticParams() {
  return deals.map((deal) => ({ slug: deal.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const deal = getDealBySlug(slug);
  if (!deal) return { title: "Deal not found" };

  const title = `${dealTitle(deal)} — ${formatCurrency(deal.payment)}/mo`;
  const description = `${dealTitle(deal)} in ${deal.city}, ${deal.state}: ${formatCurrency(
    deal.payment
  )}/mo, ${formatCurrency(deal.dueAtSigning)} due at signing, ${deal.term} month ${deal.dealType.toLowerCase()} from ${deal.sellerName}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: deal.images.length > 0 ? [{ url: deal.images[0] }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: deal.images.length > 0 ? [deal.images[0]] : undefined,
    },
  };
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const deal = getDealBySlug(slug);
  if (!deal) notFound();

  const discount = msrpDiscountPercent(deal);
  const similar = getSimilarDeals(deal, 3);

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
              {deal.badge && (
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
            {deal.verified && (
              <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-zinc-950/90 px-3 py-1 text-xs font-semibold text-emerald-400">
                <ShieldCheck size={14} /> Verified Seller
              </span>
            )}
            {deal.sample && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-amber-500/90 px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-950">
                <CircleAlert size={14} /> Sample listing — photo is a stock image, not the exact vehicle
              </span>
            )}
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {deal.dealType} · {deal.fuel} · {deal.bodyStyle}
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
                label={deal.onePay ? "One-pay lease total" : deal.dealType === "Lease" ? "Monthly payment" : "Est. monthly"}
                value={deal.onePay ? formatCurrency(deal.dueAtSigning) : `${formatCurrency(deal.payment)}/mo`}
                big
              />
              <Stat label="Due at signing" value={formatCurrency(deal.dueAtSigning)} big />
              <Stat label="Term" value={`${deal.term} months`} big />
              <Stat label="MSRP" value={formatCurrency(deal.msrp)} />
              <Stat label="Selling price" value={formatCurrency(deal.sellingPrice)} />
              {discount > 0 && <Stat label="Discount off MSRP" value={`${discount.toFixed(1)}%`} />}
              {deal.milesPerYear ? (
                <Stat label="Mileage allowance" value={`${deal.milesPerYear.toLocaleString()}/yr`} />
              ) : (
                <Stat label="Mileage allowance" value="N/A (finance)" />
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

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <h2 className="text-lg font-bold">Vehicle Details</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-zinc-300 sm:grid-cols-3">
              <Detail label="Exterior" value={deal.exterior} />
              <Detail label="Interior" value={deal.interior} />
              <Detail label="Fuel type" value={deal.fuel} />
              <Detail label="Body style" value={deal.bodyStyle} />
              <Detail label="Deal type" value={deal.dealType} />
              <Detail label="Posted" value={relativeDatePosted(deal.datePosted)} />
            </dl>

            {deal.packages.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-semibold text-zinc-400">Packages &amp; incentives</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {deal.packages.map((item) => (
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
              This deal is subject to availability and credit approval. Advertised payment and
              due-at-signing amounts may not include tax, title, registration, and documentation
              fees unless stated in the notes above. Always confirm final pricing and terms
              directly with {deal.sellerName} before signing.
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
            <p className="mt-1 text-xl font-black">{deal.sellerName}</p>
            <p className="mt-1 text-sm text-zinc-500">
              {deal.city}, {deal.state} · {deal.sellerPhone}
            </p>
            {deal.verified && (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                <ShieldCheck size={15} /> Verified seller
              </p>
            )}

            <div className="mt-5 border-t border-white/10 pt-5">
              <ContactActionsFull deal={deal} />
            </div>

            <p className="mt-4 text-xs leading-5 text-zinc-500">
              Contacting the seller connects you directly — AutoSpace Deals does not process
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

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={big ? "text-xl font-black" : "font-bold text-zinc-200"}>{value}</p>
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
