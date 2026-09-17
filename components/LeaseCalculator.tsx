"use client";

import { useMemo, useState, useTransition } from "react";
import { Calculator, Search, RotateCcw, CircleAlert, CheckCircle2, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/deal-utils";
import {
  computeLeaseEstimate,
  moneyFactorFromApr,
  aprFromMoneyFactor,
  DEFAULT_LEASE_INPUT,
  type LeaseCalculatorInput,
} from "@/lib/lease-calculator";
import { lookupLeaseNumbers, type LeaseNumbersLookup } from "@/app/calculator/actions";
import type { SuggestedIncentive } from "@/lib/ai-incentives";

// Standalone, anyone-can-use lease calculator — not tied to a specific
// listing. "Look up real numbers" tries MarketCheck for actual residual/
// money-factor/cap-cost data on the vehicle (see app/calculator/actions.ts);
// every field stays editable either way, since the point is letting a
// shopper sanity-check *any* lease quote, not just ones sourced from us.
export default function LeaseCalculator() {
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");

  const [lookupPending, startLookup] = useTransition();
  const [lookupResult, setLookupResult] = useState<LeaseNumbersLookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [input, setInput] = useState<LeaseCalculatorInput>(DEFAULT_LEASE_INPUT);
  const [aprMode, setAprMode] = useState(true); // most shoppers think in APR%, not raw money factor
  const [selectedIncentives, setSelectedIncentives] = useState<Set<number>>(new Set());
  const [suggested, setSuggested] = useState<SuggestedIncentive[]>([]);

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
        });
        setLookupResult(result);
        setSuggested(result.incentives);
        setSelectedIncentives(new Set());

        if (result.structureSource === "verified") {
          patch({
            msrp: result.msrp ?? input.msrp,
            sellingPrice: result.msrp ?? input.sellingPrice,
            residualPercent: result.residualPercent ?? input.residualPercent,
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

  function reset() {
    setInput(DEFAULT_LEASE_INPUT);
    setSelectedIncentives(new Set());
    setSuggested([]);
    setLookupResult(null);
    setLookupError(null);
  }

  return (
    <div className="space-y-6">
      {/* Vehicle lookup */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Search size={18} /> Look Up a Vehicle
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Optional — we&apos;ll try to prefill residual value, money factor, and current incentives
          from real manufacturer lease programs. You can also just fill in the numbers yourself
          below.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <TextField label="Year" value={year} onChange={setYear} placeholder="2026" />
          <TextField label="Make" value={make} onChange={setMake} placeholder="Honda" />
          <TextField label="Model" value={model} onChange={setModel} placeholder="CR-V" />
          <TextField label="Trim (optional)" value={trim} onChange={setTrim} placeholder="EX-L" />
        </div>

        <button
          type="button"
          onClick={runLookup}
          disabled={lookupPending}
          className="mt-4 flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
        >
          <Search size={15} /> {lookupPending ? "Looking up…" : "Look up real numbers"}
        </button>

        {lookupError && <p className="mt-3 text-sm text-amber-400">{lookupError}</p>}

        {lookupResult && !lookupError && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm">
            {lookupResult.structureSource === "verified" ? (
              <p className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={15} />
                Prefilled MSRP, residual %, money factor, term, and acquisition fee based on{" "}
                <span className="font-semibold">{lookupResult.basedOn}</span>.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-zinc-400">
                <CircleAlert size={15} />
                No verified lease program found for this vehicle — enter MSRP, residual %, and
                money factor manually below.
              </p>
            )}
          </div>
        )}

        {suggested.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
              <Sparkles size={14} /> Incentives that may apply
            </p>
            <div className="space-y-1.5">
              {suggested.map((inc, idx) => (
                <label
                  key={idx}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIncentives.has(idx)}
                      onChange={() => toggleIncentive(idx)}
                      className="rounded border-white/20 bg-white/5"
                    />
                    {inc.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        inc.source === "verified"
                          ? "bg-emerald-400/10 text-emerald-400"
                          : "bg-white/10 text-zinc-400"
                      }`}
                    >
                      {inc.source === "verified" ? "Verified" : "Estimated"}
                    </span>
                  </span>
                  <span className="font-semibold text-zinc-300">{formatCurrency(inc.amount)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editable numbers */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Calculator size={18} /> Lease Numbers
          </h2>
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition hover:text-white"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberField label="MSRP" value={input.msrp} onChange={(v) => patch({ msrp: v })} prefix="$" />
          <NumberField
            label="Selling price"
            value={input.sellingPrice}
            onChange={(v) => patch({ sellingPrice: v })}
            prefix="$"
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
                  className="ml-2 text-[11px] font-semibold text-zinc-500 underline hover:text-white"
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
                  className="ml-2 text-[11px] font-semibold text-zinc-500 underline hover:text-white"
                >
                  use APR %
                </button>
              }
            />
          )}

          <NumberField label="Term" value={input.term} onChange={(v) => patch({ term: v })} suffix="mo" />
          <NumberField
            label="Down payment"
            value={input.downPayment}
            onChange={(v) => patch({ downPayment: v })}
            prefix="$"
          />
          <NumberField
            label="Acquisition fee"
            value={input.acquisitionFee}
            onChange={(v) => patch({ acquisitionFee: v })}
            prefix="$"
          />
          <NumberField label="Doc fee" value={input.docFee} onChange={(v) => patch({ docFee: v })} prefix="$" />
          <NumberField
            label="Disposition fee"
            value={input.dispositionFee}
            onChange={(v) => patch({ dispositionFee: v })}
            prefix="$"
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

        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={input.includeFirstPaymentAtSigning}
            onChange={(e) => patch({ includeFirstPaymentAtSigning: e.target.checked })}
            className="rounded border-white/20 bg-white/5"
          />
          First month&apos;s payment is due at signing
        </label>
      </div>

      {/* Results */}
      <div className="rounded-2xl border border-white/10 bg-zinc-950 p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Result label="Monthly payment" value={formatCurrency(result.monthlyPayment)} big />
          <Result label="Due at signing" value={formatCurrency(result.dueAtSigning)} big />
          <Result label="Total lease cost" value={formatCurrency(result.totalLeaseCost)} />
          <Result label="Effective monthly cost" value={formatCurrency(result.effectiveMonthly)} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-xs text-zinc-500 sm:grid-cols-4">
          <span>Net cap cost: {formatCurrency(result.netCapCost)}</span>
          <span>Residual value: {formatCurrency(result.residualValue)}</span>
          <span>Depreciation fee: {formatCurrency(result.depreciationFee)}/mo</span>
          <span>Rent charge: {formatCurrency(result.rentCharge)}/mo</span>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <p>
          These numbers are estimates for comparison only, using standard lease payment math —
          actual payment depends on lender approval, exact taxes/fees, and current incentive
          eligibility. Confirm final numbers with the dealer or broker before signing.
        </p>
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
      <span className="mb-1 block text-xs font-semibold text-zinc-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600"
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
  return (
    <label className="block">
      <span className="mb-1 flex items-center text-xs font-semibold text-zinc-500">
        {label}
        {extra}
      </span>
      <div className="flex items-center rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5">
        {prefix && <span className="mr-1 text-sm text-zinc-500">{prefix}</span>}
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          step={step}
          className="w-full bg-transparent text-sm text-white outline-none"
        />
        {suffix && <span className="ml-1 text-sm text-zinc-500">{suffix}</span>}
      </div>
    </label>
  );
}

function Result({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={big ? "mt-1 text-2xl font-black text-white" : "mt-1 text-lg font-bold text-white"}>
        {value}
      </p>
    </div>
  );
}
