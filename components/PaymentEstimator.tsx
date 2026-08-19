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
  const incentives = deal.incentives ?? [];
  // Incentives already baked into the advertised numbers start checked
  // (unchecking removes that built-in discount and raises the estimate);
  // ones not yet reflected start unchecked (checking adds the discount and
  // lowers the estimate) — see IncentiveRow.includedInPrice.
  const defaultSelected = new Set(
    incentives.reduce<number[]>((acc, inc, idx) => {
      if (inc.includedInPrice) acc.push(idx);
      return acc;
    }, [])
  );

  const [dueAtSigningInput, setDueAtSigningInput] = useState(String(deal.dueAtSigning));
  const [selected, setSelected] = useState<Set<number>>(defaultSelected);
  // Net change vs. the advertised numbers: an incentive only moves the
  // estimate when its checked state differs from whether it was already
  // priced in — toggling an included-by-default one off removes its
  // discount (raises the estimate), toggling a not-yet-included one on
  // adds it (lowers the estimate). Matching states cancel out to 0.
  const incentivesTotal = incentives.reduce((sum, inc, idx) => {
    const checked = selected.has(idx) ? inc.amount : 0;
    const baseline = inc.includedInPrice ? inc.amount : 0;
    return sum + (checked - baseline);
  }, 0);

  const dueAtSigning = Math.max(0, Number(dueAtSigningInput) || 0);
  const estimate = estimatePayment(deal, { dueAtSigning, incentivesTotal });
  const isDefault =
    dueAtSigning === deal.dueAtSigning &&
    selected.size === defaultSelected.size &&
    [...selected].every((idx) => defaultSelected.has(idx));

  // Slider range: 0 up to roughly double the advertised due-at-signing (with
  // a sensible floor), rounded to a clean $500 increment so the thumb lands
  // on tidy values.
  const sliderMax = Math.max(5000, Math.ceil((deal.dueAtSigning * 2) / 500) * 500);

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
    setSelected(defaultSelected);
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
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-zinc-300">
            {deal.onePay ? "One-pay amount" : "Due at signing"}
          </label>
          <span className="text-lg font-black text-white">{formatCurrency(dueAtSigning)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={100}
          value={dueAtSigning}
          onChange={(e) => setDueAtSigningInput(e.target.value)}
          className="mt-2 w-full accent-white"
        />
        <div className="flex items-center justify-between text-[11px] text-zinc-600">
          <span>$0</span>
          <span>{formatCurrency(sliderMax)}</span>
        </div>
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
          <p className="mb-2 text-xs text-zinc-600">
            Checked incentives already included in the advertised numbers below — uncheck any
            you don&apos;t qualify for. Check any others you do qualify for to see the effect.
          </p>
          <div className="space-y-1.5">
            {incentives.map((inc, idx) => {
              const checked = selected.has(idx);
              const delta = (checked ? inc.amount : 0) - (inc.includedInPrice ? inc.amount : 0);
              return (
                <label
                  key={idx}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIncentive(idx)}
                      className="rounded border-white/20 bg-white/5"
                    />
                    {inc.name}
                    {inc.includedInPrice && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                        Included in price
                      </span>
                    )}
                  </span>
                  <span
                    className={`font-semibold ${
                      delta > 0
                        ? "text-emerald-400"
                        : delta < 0
                          ? "text-amber-400"
                          : "text-zinc-500"
                    }`}
                  >
                    {delta === 0
                      ? formatCurrency(inc.amount)
                      : `${delta > 0 ? "-" : "+"}${formatCurrency(Math.abs(delta))}`}
                  </span>
                </label>
              );
            })}
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
