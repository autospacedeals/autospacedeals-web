"use client";

import { useState } from "react";
import { Calculator, RotateCcw, CircleAlert } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { estimatePayment, formatCurrency } from "@/lib/deal-utils";

// Lets a shopper play with the drive-off amount and any listed incentives to
// see roughly how the payment would move — pure client-side math, nothing is
// sent anywhere. Intentionally simplified (linear proration, see
// estimatePayment) since the point is a ballpark "what if," not a finance
// quote, and that's disclosed clearly below the numbers.
export default function PaymentEstimator({ deal }: { deal: Deal }) {
  // Tracked as a raw string so the field can be freely cleared/retyped
  // without snapping to $0 mid-edit; the parsed, clamped number below is
  // what actually drives the live calculation on every keystroke.
  const [dueAtSigningInput, setDueAtSigningInput] = useState(String(deal.dueAtSigning));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const incentives = deal.incentives ?? [];
  const incentivesTotal = incentives.reduce(
    (sum, inc, idx) => (selected.has(idx) ? sum + inc.amount : sum),
    0
  );

  const dueAtSigning = Math.max(0, Number(dueAtSigningInput) || 0);
  const estimate = estimatePayment(deal, { dueAtSigning, incentivesTotal });
  const isDefault = dueAtSigning === deal.dueAtSigning && selected.size === 0;

  function toggleIncentive(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function reset() {
    setDueAtSigningInput(String(deal.dueAtSigning));
    setSelected(new Set());
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Calculator size={18} /> Estimate Your Payment
        </h2>
        {!isDefault && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition hover:text-white"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        Put more or less down, or apply an incentive below, to see how it changes your{" "}
        {deal.onePay ? "one-pay total" : "monthly payment"}.
      </p>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300">
          {deal.onePay ? "One-pay amount" : "Due at signing"}
        </label>
        <input
          type="number"
          min={0}
          step={100}
          value={dueAtSigningInput}
          onChange={(e) => setDueAtSigningInput(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none sm:w-56"
        />
        <p className="mt-1 text-xs text-zinc-600">
          Advertised as {formatCurrency(deal.dueAtSigning)}. Putting more down lowers your{" "}
          {deal.onePay ? "total" : "monthly payment"}; putting less down raises it.
        </p>
      </div>

      {incentives.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-semibold text-zinc-300">
            Incentives you might qualify for
          </p>
          <div className="space-y-1.5">
            {incentives.map((inc, idx) => (
              <label
                key={idx}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(idx)}
                    onChange={() => toggleIncentive(idx)}
                    className="rounded border-white/20 bg-white/5"
                  />
                  {inc.name}
                </span>
                <span className="font-semibold text-emerald-400">
                  -{formatCurrency(inc.amount)}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-zinc-600">
            Not everyone qualifies for every program — confirm eligibility with{" "}
            {deal.sellerName} before counting on one.
          </p>
        </div>
      )}

      <div className="mt-5 rounded-xl bg-zinc-950 p-4">
        {deal.onePay ? (
          <>
            <p className="text-xs text-zinc-500">Estimated one-pay total</p>
            <p className="mt-1 text-2xl font-black text-white">{formatCurrency(estimate.total)}</p>
          </>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-zinc-500">Estimated monthly payment</p>
              <p className="mt-1 text-2xl font-black text-white">
                {formatCurrency(estimate.monthly)}
                <span className="text-sm font-medium text-zinc-500">/mo + tax</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Due at signing</p>
              <p className="mt-1 text-lg font-bold text-white">{formatCurrency(estimate.total)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-zinc-500">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <p>
          These numbers are estimates for comparison only — actual payment depends on lender
          approval, taxes/fees, and current incentive eligibility. Confirm final numbers with{" "}
          {deal.sellerName} before signing.
        </p>
      </div>
    </div>
  );
}
