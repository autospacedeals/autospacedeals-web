"use client";

import Link from "next/link";
import { X, ArrowRight, Sparkles } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import {
  dealTitle,
  displayMsrp,
  effectiveMonthly,
  formatCurrency,
  msrpDiscountPercent,
  type DealScore,
} from "@/lib/deal-utils";
import { SCORE_STYLES } from "./DealCard";

// A lightweight, client-only side-by-side view — no new route, since the
// homepage already has every selected deal's full data in memory. Lays
// columns out in a horizontally scrollable row rather than a rigid grid so
// 2 or 3 selected deals both work without conditional column classes.
export default function CompareModal({
  deals,
  scores,
  onRemove,
  onClose,
}: {
  deals: Deal[];
  scores: Map<string, DealScore | null | undefined>;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-zinc-950 p-5 sm:max-w-4xl sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Comparing {deals.length} deals</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {deals.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Nothing to compare — add a deal from the grid first.
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {deals.map((deal) => {
              const score = scores.get(deal.id);
              const discount = msrpDiscountPercent(deal);
              return (
                <div
                  key={deal.id}
                  className="w-64 shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="relative overflow-hidden rounded-xl bg-zinc-900">
                      <img
                        src={deal.images[0]}
                        alt={dealTitle(deal)}
                        className="aspect-[4/3] w-full object-contain"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(deal.id)}
                    className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-zinc-500 transition hover:text-white"
                  >
                    <X size={11} /> Remove
                  </button>

                  {score && (
                    <span
                      className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${SCORE_STYLES[score.label]}`}
                    >
                      <Sparkles size={10} /> {score.text}
                    </span>
                  )}

                  <h3 className="mt-2 text-sm font-black leading-tight">{dealTitle(deal)}</h3>
                  <p className="text-xs text-zinc-500">
                    {deal.sellerName} · {deal.city}, {deal.state}
                  </p>

                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm">
                    <Row
                      label={deal.onePay ? "One-pay total" : "Monthly payment"}
                      value={formatCurrency(deal.onePay ? deal.dueAtSigning : deal.payment)}
                      big
                    />
                    <Row label="Due at signing" value={formatCurrency(deal.dueAtSigning)} />
                    <Row
                      label="Effective monthly cost"
                      value={formatCurrency(effectiveMonthly(deal))}
                      note="payment + due at signing spread over the term"
                    />
                    <Row label="Term" value={`${deal.term} mo`} />
                    <Row
                      label="Mileage"
                      value={deal.milesPerYear ? `${(deal.milesPerYear / 1000).toFixed(1)}k/yr` : "N/A"}
                    />
                    <Row label="MSRP" value={displayMsrp(deal)} />
                    {discount > 0 && <Row label="Off MSRP" value={`${discount.toFixed(0)}%`} />}
                  </div>

                  <Link
                    href={`/deals/${deal.slug}`}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
                  >
                    View full details <ArrowRight size={13} />
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Effective monthly cost is the fairest single number to compare across deals with
          different due-at-signing amounts — a lower monthly payment with a much larger upfront
          cost isn&apos;t always the better deal.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  note,
  big,
}: {
  label: string;
  value: string;
  note?: string;
  big?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-right">
        <span className={big ? "font-black text-white" : "font-semibold text-zinc-200"}>
          {value}
        </span>
        {note && <span className="block text-[10px] text-zinc-600">{note}</span>}
      </span>
    </div>
  );
}
