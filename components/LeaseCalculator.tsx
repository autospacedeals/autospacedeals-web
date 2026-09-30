"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calculator,
  Search,
  RotateCcw,
  CircleAlert,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Link2,
  Minus,
  Plus,
} from "lucide-react";
import { formatCurrency } from "@/lib/deal-utils";
import {
  computeLeaseEstimate,
  moneyFactorFromApr,
  aprFromMoneyFactor,
  encodeCalculatorState,
  decodeCalculatorState,
  DEFAULT_LEASE_INPUT,
  type LeaseCalculatorInput,
} from "@/lib/lease-calculator";
import { lookupLeaseNumbers, type LeaseNumbersLookup } from "@/app/calculator/actions";
import type { SuggestedIncentive } from "@/lib/ai-incentives";
import type { LeaseStructure } from "@/lib/marketcheck";

// Fallback term options when no real program data has been looked up yet —
// the standard 3-month-increment brackets most captive lenders offer.
const STANDARD_TERMS = [24, 27, 30, 33, 36, 39, 42, 45, 48];

// Annual mileage allowances are essentially always one of these — captive
// lenders don't quote a residual for an arbitrary number like 11,000/yr.
const MILEAGE_BRACKETS = [7500, 10000, 12000, 15000];

// The "Look up a vehicle" panel (MarketCheck residual / money factor /
// incentive prefill) is hidden for now — flip this back to true to bring it
// back. Everything behind it (runLookup, the lookupLeaseNumbers server
// action, lookup-driven term brackets) stays wired up, and with it hidden
// the calculator just runs on the manual fields and standard brackets.
const SHOW_VEHICLE_LOOKUP = false;

// Standalone, anyone-can-use lease calculator — not tied to a specific
// listing. "Look up real numbers" tries MarketCheck for actual residual/
// money-factor/cap-cost data on the vehicle (see app/calculator/actions.ts);
// every field stays editable either way, since the point is letting a
// shopper sanity-check *any* lease quote, not just ones sourced from us.
// MarketCheck's numbers come from advertised offers, not a lender rate
// sheet, so they're a grounded starting point to confirm, not a quote.
export default function LeaseCalculator() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // A shared calculator link (see "Copy shareable link" below) encodes the
  // vehicle + every input field into a `?d=` param — hydrate from it once
  // on first render if present, otherwise fall back to defaults.
  const initialState = useMemo(() => {
    const encoded = searchParams.get("d");
    return encoded ? decodeCalculatorState(encoded) : null;
  }, [searchParams]);

  const [year, setYear] = useState(initialState?.vehicle.year ?? String(new Date().getFullYear() + 1));
  const [make, setMake] = useState(initialState?.vehicle.make ?? "");
  const [model, setModel] = useState(initialState?.vehicle.model ?? "");
  const [trim, setTrim] = useState(initialState?.vehicle.trim ?? "");
  // Some manufacturer lease programs (regional lease cash, DMA-specific
  // incentives) only apply in certain areas — passing zip lets MarketCheck
  // return those instead of only nationwide programs.
  const [zip, setZip] = useState(initialState?.vehicle.zip ?? "");

  const [lookupPending, startLookup] = useTransition();
  const [lookupResult, setLookupResult] = useState<LeaseNumbersLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [input, setInput] = useState<LeaseCalculatorInput>(initialState?.input ?? DEFAULT_LEASE_INPUT);
  const [aprMode, setAprMode] = useState(initialState?.aprMode ?? true); // most shoppers think in APR%, not raw money factor
  const [selectedIncentives, setSelectedIncentives] = useState<Set<number>>(new Set());
  const [suggested, setSuggested] = useState<SuggestedIncentive[]>([]);
  const [structures, setStructures] = useState<LeaseStructure[]>([]);

  const [showMileage, setShowMileage] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [copied, setCopied] = useState(false);

  function patch(fields: Partial<LeaseCalculatorInput>) {
    setInput((prev) => ({ ...prev, ...fields }));
  }

  function runLookup() {
    const yearNum = Number(year);
    if (!make.trim() || !model.trim() || !Number.isFinite(yearNum) || yearNum < 1990) {
      setLookupError("Enter a valid year, make, and model first.");
      return;
    }
    setLookupError(null);
    startLookup(async () => {
      try {
        const result = await lookupLeaseNumbers({
          year: yearNum,
          make: make.trim(),
          model: model.trim(),
          trim: trim.trim() || undefined,
          zip: zip.trim() || undefined,
        });
        setLookupResult(result);
        setSuggested(result.incentives);
        setSelectedIncentives(new Set());
        setStructures(result.structures);

        if (result.structureSource === "verified") {
          patch({
            msrp: result.msrp ?? input.msrp,
            sellingPrice: result.msrp ?? input.sellingPrice,
            residualPercent: result.residualPercent ?? input.residualPercent,
            standardMileage: input.standardMileage,
            moneyFactor: result.moneyFactor ?? input.moneyFactor,
            term: result.term ?? input.term,
            acquisitionFee: result.acquisitionFee ?? input.acquisitionFee,
          });
        }
      } catch (err) {
        console.error("Lease numbers lookup failed:", err);
        setLookupError("Couldn't look up real numbers right now — enter them manually below.");
      }
    });
  }

  const incentivesTotal = useMemo(
    () => suggested.reduce((sum, inc, idx) => sum + (selectedIncentives.has(idx) ? inc.amount : 0), 0),
    [suggested, selectedIncentives]
  );

  function toggleIncentive(idx: number) {
    setSelectedIncentives((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const result = useMemo(
    () => computeLeaseEstimate({ ...input, incentivesTotal }),
    [input, incentivesTotal]
  );

  // Terms the little +/- adjuster next to "Term" steps through — real
  // program lengths once a vehicle's been looked up (so stepping snaps to
  // whatever's actually offered, e.g. 24/36/39mo, and pulls in that term's
  // own residual/money factor/acquisition fee), or a standard 3-month-
  // increment bracket before any lookup has run.
  const availableTerms = useMemo(() => {
    if (structures.length === 0) return STANDARD_TERMS;
    return Array.from(new Set(structures.map((s) => s.term))).sort((a, b) => a - b);
  }, [structures]);

  function selectTerm(term: number) {
    const structure = structures.find((s) => s.term === term);
    if (structure) {
      patch({
        term,
        residualPercent: Math.round(structure.residualPercent * 10) / 10,
        moneyFactor: structure.moneyFactor,
        acquisitionFee: structure.acquisitionFee ?? input.acquisitionFee,
      });
    } else {
      patch({ term });
    }
  }

  function reset() {
    setInput(DEFAULT_LEASE_INPUT);
    setSelectedIncentives(new Set());
    setSuggested([]);
    setStructures([]);
    setLookupResult(null);
    setLookupError(null);
    router.replace("/calculator");
  }

  function copyShareLink() {
    const encoded = encodeCalculatorState({ vehicle: { year, make, model, trim, zip }, input, aprMode });
    const url = `${window.location.origin}/calculator${encoded ? `?d=${encoded}` : ""}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => console.error("Copy shareable link failed:", err));
  }

  return (
    <div className="space-y-6">
      {/* Vehicle lookup — hidden for now, see SHOW_VEHICLE_LOOKUP */}
      {SHOW_VEHICLE_LOOKUP && (
        <div className="panel">
          <h2 className="panel-title">
            <Search /> Look up a vehicle
          </h2>
          <p className="mt-1.5 text-sm text-fg-muted">
            Optional — we&apos;ll try to prefill residual value, money factor, and current incentives
            from real manufacturer lease programs. You can also just fill in the numbers yourself
            below.
          </p>

          <div className="mt-5 grid grid-cols-2 items-end gap-4 sm:grid-cols-5">
            <TextField label="Year" value={year} onChange={setYear} placeholder="2026" />
            <TextField label="Make" value={make} onChange={setMake} placeholder="Honda" />
            <TextField label="Model" value={model} onChange={setModel} placeholder="CR-V" />
            <TextField label="Trim (optional)" value={trim} onChange={setTrim} placeholder="EX-L" />
            <TextField
              label="Zip (optional)"
              value={zip}
              onChange={setZip}
              placeholder="90210"
            />
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            Zip helps surface region-specific lease cash — some manufacturer incentives only apply
            in certain areas.
          </p>

          <button
            type="button"
            onClick={runLookup}
            disabled={lookupPending}
            className="btn btn-primary mt-5"
          >
            <Search /> {lookupPending ? "Looking up…" : "Look up real numbers"}
          </button>

          {lookupError && <p className="mt-3 text-sm text-warning">{lookupError}</p>}

          {lookupResult && !lookupError && (
            <div
              className={`alert mt-4 ${
                lookupResult.structureSource === "verified" ? "alert-success" : "alert-info"
              }`}
            >
              {lookupResult.structureSource === "verified" ? (
                <>
                  <CheckCircle2 />
                  <p>
                    Prefilled MSRP, residual %, money factor, term, and acquisition fee based on{" "}
                    <span className="font-semibold">{lookupResult.basedOn}</span> — a real advertised
                    offer, not a lender rate sheet. Confirm before relying on it.
                  </p>
                </>
              ) : (
                <>
                  <CircleAlert />
                  <p>
                    No verified lease program found for this vehicle — enter MSRP, residual %, and
                    money factor manually below.
                  </p>
                </>
              )}
            </div>
          )}

          {suggested.length > 0 && (
            <div>
              <p className="field-label mt-5 flex items-center gap-1.5">
                <Sparkles size={14} /> Incentives that may apply
              </p>
              <div className="space-y-2">
                {suggested.map((inc, idx) => (
                  <label key={idx} className="choice justify-between">
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIncentives.has(idx)}
                        onChange={() => toggleIncentive(idx)}
                        className="checkbox"
                      />
                      {inc.name}
                      <span
                        className={`pill ${
                          inc.source === "verified" ? "pill-success" : "pill-neutral"
                        }`}
                      >
                        {inc.source === "verified" ? "Verified" : "Estimated"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-fg">{formatCurrency(inc.amount)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editable numbers */}
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="panel-title">
            <Calculator /> Lease numbers
          </h2>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" onClick={copyShareLink} className="btn btn-ghost btn-sm">
              <Link2 /> {copied ? "Copied!" : "Copy shareable link"}
            </button>
            <button type="button" onClick={reset} className="btn btn-ghost btn-sm">
              <RotateCcw /> Reset
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
          <NumberField
            label="MSRP"
            value={input.msrp}
            onChange={(v) => patch({ msrp: v })}
            prefix="$"
            step={250}
          />
          <NumberField
            label="Selling price"
            value={input.sellingPrice}
            onChange={(v) => patch({ sellingPrice: v })}
            prefix="$"
            step={250}
            extra={
              result.percentOffMsrp > 0 ? (
                <span className="pill pill-success">
                  {result.percentOffMsrp.toFixed(1)}% off MSRP
                </span>
              ) : undefined
            }
          />
          <NumberField
            label="Residual %"
            value={input.residualPercent}
            onChange={(v) => patch({ residualPercent: v })}
            suffix="%"
            step={0.1}
          />

          {aprMode ? (
            <NumberField
              label="APR-equivalent"
              value={Math.round(aprFromMoneyFactor(input.moneyFactor) * 100) / 100}
              onChange={(v) => patch({ moneyFactor: moneyFactorFromApr(v) })}
              suffix="%"
              step={0.1}
              extra={
                <button
                  type="button"
                  onClick={() => setAprMode(false)}
                  className="text-[11px] font-medium text-fg-muted underline decoration-dotted underline-offset-2 hover:text-fg"
                >
                  use money factor
                </button>
              }
            />
          ) : (
            <NumberField
              label="Money factor"
              value={input.moneyFactor}
              onChange={(v) => patch({ moneyFactor: v })}
              step={0.00005}
              extra={
                <button
                  type="button"
                  onClick={() => setAprMode(true)}
                  className="text-[11px] font-medium text-fg-muted underline decoration-dotted underline-offset-2 hover:text-fg"
                >
                  use APR %
                </button>
              }
            />
          )}

          <BracketStepper
            // Full width on phones: the ± buttons plus "months" leave no
            // room for the number itself in a half-width cell.
            className="max-sm:col-span-2"
            label="Term"
            badge={structures.length > 0 && <span className="text-success">· real programs</span>}
            value={input.term}
            brackets={availableTerms}
            suffix="months"
            onSelect={selectTerm}
            onManualChange={(v) => patch({ term: v })}
          />
          <NumberField
            label="Down payment"
            value={input.downPayment}
            onChange={(v) => patch({ downPayment: v })}
            prefix="$"
            step={100}
          />
          <NumberField
            label="Payment tax rate"
            value={input.paymentTaxRate}
            onChange={(v) => patch({ paymentTaxRate: v })}
            suffix="%"
            step={0.1}
          />
          <NumberField
            label="Due-at-signing tax rate"
            value={input.dueAtSigningTaxRate}
            onChange={(v) => patch({ dueAtSigningTaxRate: v })}
            suffix="%"
            step={0.1}
          />
        </div>

        <p className="mt-2 text-[11px] text-fg-muted">
          {structures.length > 0
            ? `Real programs found for ${availableTerms.join(", ")} months — the term adjuster snaps to these and updates residual %/money factor to match.`
            : `The term adjuster steps through standard ${availableTerms[0]}–${availableTerms[availableTerms.length - 1]} month brackets without changing residual/money factor.`}
        </p>

        {/* Trade-in */}
        <div className="mt-5 border-t border-line pt-5">
          <p className="mb-3 text-sm font-medium text-fg">Trade-in (optional)</p>
          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3">
            <NumberField
              label="Trade-in value"
              value={input.tradeInValue}
              onChange={(v) => patch({ tradeInValue: v })}
              prefix="$"
              step={100}
            />
            <NumberField
              label="Loan payoff owed"
              value={input.tradeInPayoff}
              onChange={(v) => patch({ tradeInPayoff: v })}
              prefix="$"
              step={100}
            />
            <div className="col-span-2 flex flex-col sm:col-span-1">
              <span className="field-label">Trade equity</span>
              <div className="input-group">
                <span
                  className={`text-sm font-semibold ${
                    result.tradeEquity < 0 ? "text-warning" : "text-fg"
                  }`}
                >
                  {result.tradeEquity < 0 ? "-" : ""}
                  {formatCurrency(Math.abs(result.tradeEquity))}
                </span>
                <span className="ml-2 text-[11px] leading-4 text-fg-muted">
                  {result.tradeEquity < 0 ? "rolled into payment" : "reduces cap cost"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Fees — each can be paid at signing or rolled into the payment */}
        <div className="mt-5 border-t border-line pt-5">
          <p className="mb-3 text-sm font-medium text-fg">Fees</p>
          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeeField
              label="Acquisition fee"
              amount={input.acquisitionFee}
              onAmountChange={(v) => patch({ acquisitionFee: v })}
              capitalized={input.acquisitionFeeCapitalized}
              onCapitalizedChange={(v) => patch({ acquisitionFeeCapitalized: v })}
              step={25}
            />
            <FeeField
              label="Doc fee"
              amount={input.docFee}
              onAmountChange={(v) => patch({ docFee: v })}
              capitalized={input.docFeeCapitalized}
              onCapitalizedChange={(v) => patch({ docFeeCapitalized: v })}
              step={25}
            />
            <FeeField
              label="Gov / DMV fee"
              amount={input.govFee}
              onAmountChange={(v) => patch({ govFee: v })}
              capitalized={input.govFeeCapitalized}
              onCapitalizedChange={(v) => patch({ govFeeCapitalized: v })}
              step={25}
            />
          </div>
          <div className="mt-4">
            <NumberField
              label="Disposition fee (due at lease-end, informational)"
              value={input.dispositionFee}
              onChange={(v) => patch({ dispositionFee: v })}
              prefix="$"
              step={25}
            />
          </div>
        </div>

        {/* Mileage adjustment */}
        <div className="mt-5 border-t border-line pt-5">
          <button
            type="button"
            onClick={() => setShowMileage((v) => !v)}
            aria-expanded={showMileage}
            className="inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg pointer-coarse:min-h-11"
          >
            {showMileage ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Mileage adjustment
          </button>
          {showMileage && (
            <div className="mt-3 grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
              <BracketStepper
                label="Your annual mileage"
                value={input.annualMileage}
                brackets={MILEAGE_BRACKETS}
                suffix="per year"
                onSelect={(v) => patch({ annualMileage: v })}
                onManualChange={(v) => patch({ annualMileage: v })}
              />
              <BracketStepper
                label="Mileage residual was quoted for"
                value={input.standardMileage}
                brackets={MILEAGE_BRACKETS}
                suffix="per year"
                onSelect={(v) => patch({ standardMileage: v })}
                onManualChange={(v) => patch({ standardMileage: v })}
              />
              <NumberField
                label="Residual adjustment"
                value={input.residualAdjustmentPerMile}
                onChange={(v) => patch({ residualAdjustmentPerMile: v })}
                prefix="$"
                suffix="/mi"
                step={0.001}
              />
            </div>
          )}
          {result.residualAdjustmentDollars !== 0 && (
            <p className="mt-3 text-xs leading-5 text-fg-muted">
              Driving {input.annualMileage.toLocaleString()} miles per year instead of the quoted{" "}
              {input.standardMileage.toLocaleString()} miles per year adjusts residual{" "}
              {result.residualAdjustmentDollars < 0 ? "down" : "up"} by{" "}
              {formatCurrency(Math.abs(result.residualAdjustmentDollars))}, to{" "}
              {formatCurrency(result.residualValue)} ({result.adjustedResidualPercent.toFixed(1)}%).
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col border-t border-line pt-2 sm:flex-row sm:items-center sm:gap-6">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-fg-secondary">
            <input
              type="checkbox"
              checked={input.onePay}
              onChange={(e) => patch({ onePay: e.target.checked })}
              className="checkbox"
            />
            One-pay lease (single upfront payment, no monthly bill)
          </label>
          {!input.onePay && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-fg-secondary">
              <input
                type="checkbox"
                checked={input.includeFirstPaymentAtSigning}
                onChange={(e) => patch({ includeFirstPaymentAtSigning: e.target.checked })}
                className="checkbox"
              />
              First month&apos;s payment is due at signing
            </label>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs leading-5 text-fg-muted">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <p>
          These numbers are estimates for comparison only, using standard lease payment math —
          actual payment depends on lender approval, exact taxes/fees, and current incentive
          eligibility. Confirm final numbers with the dealer or broker before signing.
        </p>
      </div>

      {/* Results — pinned to the bottom of the viewport so the live totals
          stay visible while scrolling back up to tweak a field, instead of
          having to scroll back down after every change. */}
      <div data-results-bar="lease" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 backdrop-blur-xl">
        <div aria-hidden="true" className="light-bar absolute inset-x-0 top-0" />
        <div className="container-page max-w-4xl py-3 sm:py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6">
            {input.onePay ? (
              <Result
                label="One-pay total"
                value={formatCurrency(result.dueAtSigningBreakdown.onePayTotal)}
                big
              />
            ) : (
              <Result label="Monthly payment" value={formatCurrency(result.monthlyPayment)} big />
            )}
            <Result label="Due at signing" value={formatCurrency(result.dueAtSigning)} big />
            <Result label="Total lease cost" value={formatCurrency(result.totalLeaseCost)} />
            <Result label="Effective monthly cost" value={formatCurrency(result.effectiveMonthly)} />
          </div>

          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            aria-expanded={showBreakdown}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            {showBreakdown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            {showBreakdown ? "Hide" : "Show"} due-at-signing breakdown
          </button>
          {showBreakdown && (
            <div className="well mt-2 grid grid-cols-2 gap-2 p-3 text-[11px] text-fg-secondary sm:grid-cols-4">
              <span>Down payment: {formatCurrency(result.dueAtSigningBreakdown.downPayment)}</span>
              <span>Upfront fees: {formatCurrency(result.dueAtSigningBreakdown.upfrontFees)}</span>
              {input.onePay ? (
                <span>One-pay total: {formatCurrency(result.dueAtSigningBreakdown.onePayTotal)}</span>
              ) : (
                <span>First payment: {formatCurrency(result.dueAtSigningBreakdown.firstPayment)}</span>
              )}
              <span>Tax: {formatCurrency(result.dueAtSigningBreakdown.tax)}</span>
            </div>
          )}

          <div className="mt-2 hidden grid-cols-4 gap-3 border-t border-line pt-2 text-[11px] text-fg-muted sm:grid">
            <span>Net cap cost: {formatCurrency(result.netCapCost)}</span>
            <span>Residual value: {formatCurrency(result.residualValue)}</span>
            <span>Depreciation fee: {formatCurrency(result.depreciationFee)}/mo</span>
            <span>Rent charge: {formatCurrency(result.rentCharge)}/mo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Generic stepper whose +/- buttons snap to a fixed set of real-world
// brackets (lease term lengths, mileage allowances, etc.) instead of the
// browser's native ±1 spin buttons, which have no relationship to what's
// actually offered. The number stays directly editable (onManualChange)
// for a one-off custom value that doesn't need to match a bracket.
function BracketStepper({
  className,
  label,
  badge,
  value,
  brackets,
  suffix,
  onSelect,
  onManualChange,
}: {
  className?: string;
  label: string;
  badge?: React.ReactNode;
  value: number;
  brackets: number[];
  suffix: string;
  onSelect: (v: number) => void;
  onManualChange: (v: number) => void;
}) {
  function step(direction: 1 | -1) {
    const idx = brackets.indexOf(value);
    let next: number | undefined;

    if (idx !== -1) {
      next = brackets[idx + direction];
    } else if (direction === 1) {
      next = brackets.find((b) => b > value);
    } else {
      next = [...brackets].reverse().find((b) => b < value);
    }

    if (next !== undefined) onSelect(next);
  }

  // Explicit htmlFor/id: wrapping the +/- buttons in the <label> made the
  // "Lower" button its labeled control, so clicking the label stepped down.
  const inputId = useId();

  return (
    <div className={className}>
      <label htmlFor={inputId} className="field-label">
        {label} {badge}
      </label>
      <div className="input-group max-sm:px-2">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={`Lower ${label}`}
          className="stepper-btn"
        >
          <Minus />
        </button>
        <input
          id={inputId}
          type="number"
          value={value}
          onChange={(e) => onManualChange(Number(e.target.value))}
          className="text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="input-affix">{suffix}</span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={`Higher ${label}`}
          className="stepper-btn"
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  extra,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  extra?: React.ReactNode;
}) {
  // Explicit htmlFor/id so an `extra` button (APR / money factor toggle)
  // isn't the label's labeled control — clicking the label focuses the input.
  const inputId = useId();

  return (
    <label htmlFor={inputId} className="block">
      <span className="field-label flex flex-wrap items-center gap-x-2 gap-y-1">
        {label}
        {extra}
      </span>
      <div className="input-group">
        {prefix && <span className="input-affix">{prefix}</span>}
        <input
          id={inputId}
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          step={step}
        />
        {suffix && <span className="input-affix">{suffix}</span>}
      </div>
    </label>
  );
}

// A fee amount plus a two-way toggle for whether it's paid in cash at
// signing or capitalized (rolled into the monthly payment) — real leases
// vary on this per fee, so it's not safe to hard-code either way.
function FeeField({
  label,
  amount,
  onAmountChange,
  capitalized,
  onCapitalizedChange,
  step = 1,
}: {
  label: string;
  amount: number;
  onAmountChange: (v: number) => void;
  capitalized: boolean;
  onCapitalizedChange: (v: boolean) => void;
  step?: number;
}) {
  return (
    <div>
      <NumberField label={label} value={amount} onChange={onAmountChange} prefix="$" step={step} />
      <div role="group" aria-label={`${label}: how it's paid`} className="segmented mt-2 flex w-full">
        <button
          type="button"
          onClick={() => onCapitalizedChange(true)}
          aria-pressed={capitalized}
          className="segmented-item flex-auto justify-center px-2.5 text-center text-xs leading-tight"
        >
          Rolled into payment
        </button>
        <button
          type="button"
          onClick={() => onCapitalizedChange(false)}
          aria-pressed={!capitalized}
          className="segmented-item flex-auto justify-center px-2.5 text-center text-xs leading-tight"
        >
          Paid at signing
        </button>
      </div>
    </div>
  );
}

function Result({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={big ? "stat-value mt-1.5" : "mt-1.5 text-lg font-semibold text-fg-secondary"}>
        {value}
      </p>
    </div>
  );
}
