"use client";

import { useState } from "react";
import { Calculator, RotateCcw, CircleAlert } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { estimatePayment, formatCurrency, formatTerm, leaseCombos } from "@/lib/deal-utils";
import { isRequiredProgram } from "@/lib/deal-options";

// Lets a shopper pick a term and mileage the seller priced, and play with
// the drive-off amount and any listed incentives to see roughly how the
// payment would move — pure client-side math, nothing is
// sent anywhere. Intentionally simplified (linear proration, see
// estimatePayment) since the point is a ballpark "what if," not a finance
// quote, and that's disclosed clearly below the numbers.
export default function PaymentEstimator({ deal }: { deal: Deal }) {
  // Tracked as a raw string so the field can be freely cleared/retyped
  // without snapping to $0 mid-edit; the parsed, clamped number below is
  // what actually drives the live calculation on every keystroke.
  // Programs the price requires with no stated value ("with MyFirstEV")
  // aren't toggles — they're listed as requirements below.
  const required = (deal.incentives ?? []).filter(isRequiredProgram);
  const incentives = (deal.incentives ?? []).filter((inc) => !isRequiredProgram(inc));
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
  // An incentive with a stated per-month value moves the payment by exactly
  // that; one with only a dollar amount is spread over the term.
  const toggled = (idx: number) => selected.has(idx) !== (incentives[idx].includedInPrice === true);
  const sign = (idx: number) => (selected.has(idx) ? 1 : -1);
  const incentivesTotal = incentives.reduce(
    (sum, inc, idx) => (toggled(idx) && !inc.monthly ? sum + sign(idx) * inc.amount : sum),
    0
  );
  const incentivesMonthly = incentives.reduce(
    (sum, inc, idx) => (toggled(idx) && inc.monthly ? sum - sign(idx) * inc.monthly : sum),
    0
  );

  // Every term + mileage the seller priced (the advertised one first); the
  // shopper picks a term, then a mileage offered at that term.
  const combos = leaseCombos(deal);
  const terms = [...new Set(combos.map((c) => c.term))].sort((a, b) => a - b);
  const [term, setTerm] = useState(deal.term);
  const [miles, setMiles] = useState<number | null>(deal.milesPerYear);
  const atTerm = combos.filter((c) => c.term === term).sort((a, b) => (a.milesPerYear ?? 0) - (b.milesPerYear ?? 0));
  const chosen = atTerm.find((c) => c.milesPerYear === miles) ?? atTerm[0] ?? combos[0];

  function pickTerm(next: number) {
    setTerm(next);
    const options = combos.filter((c) => c.term === next);
    // Keep the mileage if it's offered at the new term, else its cheapest.
    if (!options.some((c) => c.milesPerYear === miles)) {
      setMiles([...options].sort((a, b) => a.payment - b.payment)[0]?.milesPerYear ?? null);
    }
  }

  const dueAtSigning = Math.max(0, Number(dueAtSigningInput) || 0);
  const estimate = estimatePayment(
    { ...deal, term: chosen.term, payment: chosen.payment },
    { dueAtSigning, incentivesTotal, monthlyAdjustment: incentivesMonthly }
  );
  const isDefault =
    dueAtSigning === deal.dueAtSigning &&
    chosen.headline &&
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
    setTerm(deal.term);
    setMiles(deal.milesPerYear);
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
        {combos.length > 1 ? "Pick a term and mileage, put" : "Put"} more or less down, or apply an incentive below,
        to see how it changes your{" "}
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

      {combos.length > 1 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {terms.length > 1 && (
            <div>
              <label htmlFor="estimator-term" className="field-label">
                Lease term
              </label>
              <select
                id="estimator-term"
                value={String(term)}
                onChange={(e) => pickTerm(Number(e.target.value))}
                className="select"
              >
                {terms.map((t) => {
                  const from = Math.min(...combos.filter((c) => c.term === t).map((c) => c.payment));
                  return (
                    <option key={t} value={String(t)}>
                      {formatTerm(t)} · from {formatCurrency(from)}/mo
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          {atTerm.length > 1 && (
            <div>
              <label htmlFor="estimator-mileage" className="field-label">
                Miles per year
              </label>
              <select
                id="estimator-mileage"
                value={String(chosen.milesPerYear ?? "")}
                onChange={(e) => setMiles(e.target.value ? Number(e.target.value) : null)}
                className="select"
              >
                {atTerm.map((c) => (
                  <option key={c.milesPerYear ?? "none"} value={String(c.milesPerYear ?? "")}>
                    {c.milesPerYear ? `${c.milesPerYear.toLocaleString("en-US")} mi/yr` : "Mileage not stated"} ·{" "}
                    {formatCurrency(c.payment)}/mo
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {required.length > 0 && (
        <div className="callout mt-6 text-sm">
          <p className="font-medium text-fg">
            This price requires {required.map((r) => r.name).join(" and ")}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-muted">
            {`You need to qualify for ${required.length === 1 ? "this program" : "these programs"} to get this price. Ask ${deal.sellerName} if you're not sure.`}
          </p>
        </div>
      )}

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
              // Positive = a discount being added (lowers the estimate).
              const value = inc.monthly || inc.amount;
              const delta = toggled(idx) ? sign(idx) * value : 0;
              const unit = inc.monthly ? "/mo" : "";
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
                      ? `${formatCurrency(value)}${unit}`
                      : `${delta > 0 ? "-" : "+"}${formatCurrency(Math.abs(delta))}${unit}`}
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
