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
    <section className="panel mt-6">
      {/* Row reserves the Reset button's height (36px, 44px on touch) so the
          slider doesn't jump down when Reset appears mid-drag. */}
      <div className="flex min-h-9 items-center justify-between gap-3 pointer-coarse:min-h-11">
        <h2 className="panel-title">
          <Calculator /> Estimate your payment
        </h2>
        {!isDefault && (
          <button type="button" onClick={reset} className="btn btn-ghost btn-sm -mr-2 px-3">
            <RotateCcw /> Reset
          </button>
        )}
      </div>
      <p className="mt-1.5 text-sm text-fg-muted">
        Put more or less down, or apply an incentive below, to see how it changes your{" "}
        {deal.onePay ? "one-pay total" : "monthly payment"}.
      </p>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="estimator-das" className="text-[13px] font-medium text-fg-secondary">
            {deal.onePay ? "One-pay amount" : "Due at signing"}
          </label>
          <span className="stat-value text-lg">{formatCurrency(dueAtSigning)}</span>
        </div>
        <input
          id="estimator-das"
          type="range"
          min={0}
          max={sliderMax}
          step={100}
          value={dueAtSigning}
          onChange={(e) => setDueAtSigningInput(e.target.value)}
          className="range mt-2"
          style={{ "--range-pct": `${Math.min(100, (dueAtSigning / sliderMax) * 100)}%` } as React.CSSProperties}
        />
        <div className="flex items-center justify-between text-[11px] text-fg-muted">
          <span>$0</span>
          <span>{formatCurrency(sliderMax)}</span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-fg-muted">
          Advertised as {formatCurrency(deal.dueAtSigning)}. Putting more down lowers your{" "}
          {deal.onePay ? "total" : "monthly payment"}; putting less down raises it.
        </p>
      </div>

      {incentives.length > 0 && (
        <div className="mt-6">
          <p className="field-label">Incentives you might qualify for</p>
          <p className="mb-2.5 text-xs leading-5 text-fg-muted">
            Checked incentives already included in the advertised numbers below — uncheck any
            you don&apos;t qualify for. Check any others you do qualify for to see the effect.
          </p>
          <div className="space-y-2">
            {incentives.map((inc, idx) => {
              const checked = selected.has(idx);
              const delta = (checked ? inc.amount : 0) - (inc.includedInPrice ? inc.amount : 0);
              return (
                <label key={idx} className="choice justify-between">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleIncentive(idx)}
                      className="checkbox"
                    />
                    {/* Only the name + pill wrap, so a long name never drops
                        onto its own line away from its checkbox. */}
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                      {inc.name}
                      {inc.includedInPrice && <span className="pill pill-neutral">Included in price</span>}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-semibold ${
                      delta > 0 ? "text-success" : delta < 0 ? "text-warning" : "text-fg-muted"
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
          <p className="mt-2 text-xs leading-5 text-fg-muted">
            Not everyone qualifies for every program — confirm eligibility with{" "}
            {deal.sellerName} before counting on one.
          </p>
        </div>
      )}

      <div className="well mt-5">
        {deal.onePay ? (
          <>
            <p className="label">Estimated one-pay total</p>
            <p className="stat-value mt-2">{formatCurrency(estimate.total)}</p>
          </>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="label">Estimated monthly payment</p>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="stat-value">{formatCurrency(estimate.monthly)}</span>
                <span className="price-unit">/mo + tax</span>
              </p>
            </div>
            <div className="text-right">
              <p className="label">Due at signing</p>
              <p className="mt-2 text-lg font-semibold text-fg">{formatCurrency(estimate.total)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-fg-muted">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <p>
          These numbers are estimates for comparison only — actual payment depends on lender
          approval, taxes/fees, and current incentive eligibility. Confirm final numbers with{" "}
          {deal.sellerName} before signing.
        </p>
      </div>
    </section>
  );
}
