import Link from "next/link";
import { MapPin, Gauge, ArrowRight, Store } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { displayMsrp, formatCurrency, msrpDiscountPercent, relativeDatePosted } from "@/lib/deal-utils";
import { ContactActionsCompact } from "./ContactActions";

const BADGE_STYLES: Record<string, string> = {
  HOT: "bg-orange-500 text-white",
  NEW: "bg-blue-500 text-white",
  VALUE: "bg-emerald-500 text-white",
  EV: "bg-teal-500 text-white",
};

// Deprioritized for now per Robert — keeping the styles/logic above intact
// (and the underlying `badge` data untouched) in case we want these back;
// this just stops them from rendering. Exported so the deal detail page's
// photo badge respects the same list.
export const HIDDEN_BADGES = new Set(["HOT", "VALUE"]);

const CONDITION_STYLES: Record<string, string> = {
  New: "bg-blue-500 text-white",
  CPO: "bg-emerald-500 text-white",
  Loaner: "bg-amber-500 text-zinc-950",
  Demo: "bg-amber-500 text-zinc-950",
  Used: "bg-zinc-700 text-white",
};

export default function DealCard({ deal }: { deal: Deal }) {
  const image = deal.images[0];
  const discount = msrpDiscountPercent(deal);
  const detailHref = `/deals/${deal.slug}`;

  return (
    <article className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20 hover:bg-white/[0.07] sm:p-5">
      <Link href={detailHref} className="block">
        <div className="relative mb-4 overflow-hidden rounded-2xl bg-zinc-900">
          <img
            src={image}
            alt={`${deal.year} ${deal.make} ${deal.model}`}
            className="h-44 w-full object-cover transition duration-300 group-hover:scale-105 sm:h-48"
          />

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {deal.badge && !HIDDEN_BADGES.has(deal.badge) && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  BADGE_STYLES[deal.badge] ?? "bg-white text-zinc-950"
                }`}
              >
                {deal.badge}
              </span>
            )}
            {!deal.inStock && (
              <span className="rounded-full bg-zinc-950/90 px-2.5 py-1 text-xs font-bold text-zinc-300">
                Pending / Call to confirm
              </span>
            )}
          </div>

          {deal.condition && (
            <span
              className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${
                CONDITION_STYLES[deal.condition] ?? "bg-zinc-950/90 text-zinc-300"
              }`}
            >
              {deal.condition}
            </span>
          )}

          {deal.sample ? (
            <span className="absolute inset-x-0 bottom-0 bg-amber-500/90 px-2.5 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-zinc-950">
              Sample listing — photo not exact vehicle
            </span>
          ) : (
            deal.photoAutoSourced && (
              <span className="absolute inset-x-0 bottom-0 bg-zinc-950/85 px-2.5 py-1 text-center text-[11px] font-semibold text-zinc-300">
                Stock photo — may not be exact vehicle
              </span>
            )
          )}
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {[deal.dealType, deal.fuel].filter(Boolean).join(" · ")}
        </p>
        <h3 className="mt-1 text-xl font-black leading-tight">
          {deal.year} {deal.make} {deal.model}
        </h3>
        {deal.trim && <p className="text-sm text-zinc-400">{deal.trim}</p>}
      </Link>

      <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
        <div>
          <p className="text-xs text-zinc-500">
            {deal.onePay ? "One-pay lease total" : "Monthly payment"}
          </p>
          <p className="text-3xl font-black">
            {formatCurrency(deal.onePay ? deal.dueAtSigning : deal.payment)}
            {!deal.onePay && (
              <span className="text-sm font-medium text-zinc-500">
                /mo{deal.paymentTaxRate ? ` (incl. ~${deal.paymentTaxRate}% tax)` : " + tax"}
              </span>
            )}
          </p>
        </div>
        {discount > 0 && (
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
            {discount.toFixed(0)}% off MSRP
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-zinc-300">
        <Stat
          label="Due at signing"
          value={formatCurrency(deal.dueAtSigning)}
          note={deal.dueAtSigningTaxRate ? `assumes ${deal.dueAtSigningTaxRate}% tax` : undefined}
        />
        <Stat label="Term" value={`${deal.term} mo`} />
        <Stat
          label="Mileage"
          value={deal.milesPerYear ? `${(deal.milesPerYear / 1000).toFixed(1)}k/yr` : "N/A"}
        />
        <Stat label="MSRP" value={displayMsrp(deal)} />
        {deal.brokerFee != null && (
          <Stat label="Broker fee" value={formatCurrency(deal.brokerFee)} note="separate from due at signing" />
        )}
      </div>

      <div className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-sm text-zinc-400">
        <p className="flex items-center gap-2">
          <MapPin size={15} /> {deal.city}, {deal.state}
        </p>
        <p className="flex items-center gap-2">
          <Store size={15} />
          {deal.brokerId ? (
            <Link
              href={`/brokers/${deal.brokerId}`}
              className="font-semibold text-zinc-300 hover:text-white hover:underline"
            >
              {deal.sellerName}
            </Link>
          ) : (
            deal.sellerName
          )}{" "}
          · {deal.sellerType}
          {deal.sellerDealership && ` at ${deal.sellerDealership}`}
        </p>
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <Gauge size={13} /> {relativeDatePosted(deal.datePosted)}
        </p>
      </div>

      <ContactActionsCompact deal={deal} />

      <Link
        href={detailHref}
        className="mt-2 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
      >
        View Full Details <ArrowRight size={15} />
      </Link>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className="font-bold">{value}</p>
      {note && <p className="text-[10px] text-zinc-600">{note}</p>}
    </div>
  );
}
