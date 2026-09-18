"use client";

import { useMemo, useState } from "react";
import { CircleAlert, Scale } from "lucide-react";
import { formatCurrency } from "@/lib/deal-utils";
import {
  computeLeaseEndEstimate,
  DEFAULT_LEASE_END_INPUT,
  type LeaseEndInput,
} from "@/lib/lease-calculator";

// "Should I buy out my lease or return it?" — the other big decision point
// besides "what will my payment be," and one Leasehackr barely covers.
// Buying out isn't a pure cost (you end up owning a car worth something),
// so the fair comparison is net cost — what you pay minus what the car is
// worth — against returning's pure fees. See computeLeaseEndEstimate.
export default function LeaseEndCalculator() {
  const [input, setInput] = useState<LeaseEndInput>(DEFAULT_LEASE_END_INPUT);

  function patch(fields: Partial<LeaseEndInput>) {
    setInput((prev) => ({ ...prev, ...fields }));
  }

  const result = useMemo(() => computeLeaseEndEstimate(input), [input]);

  return (
    <div className="space-y-6 pb-32 sm:pb-36">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-zinc-300">Buyout</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label="Residual payoff"
            value={input.residualPayoff}
            onChange={(v) => patch({ residualPayoff: v })}
            prefix="$"
            step={250}
          />
          <NumberField
            label="Purchase option fee"
            value={input.purchaseOptionFee}
            onChange={(v) => patch({ purchaseOptionFee: v })}
            prefix="$"
            step={25}
          />
          <NumberField
            label="Buyout tax rate"
            value={input.buyoutTaxRate}
            onChange={(v) => patch({ buyoutTaxRate: v })}
            suffix="%"
            step={0.1}
          />
          <NumberField
            label="Est. market value today"
            value={input.estimatedMarketValue}
            onChange={(v) => patch({ estimatedMarketValue: v })}
            prefix="$"
            step={250}
          />
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Check what the car is actually worth right now (a dealer trade-in quote or a private-
          sale listing site) — that number is what makes this comparison meaningful.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <p className="mb-3 text-sm font-semibold text-zinc-300">Return</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label="Disposition fee"
            value={input.dispositionFee}
            onChange={(v) => patch({ dispositionFee: v })}
            prefix="$"
            step={25}
          />
          <NumberField
            label="Total miles driven"
            value={input.totalMilesDriven}
            onChange={(v) => patch({ totalMilesDriven: v })}
            step={500}
          />
          <NumberField
            label="Full-term mileage allowance"
            value={input.totalMileageAllowance}
            onChange={(v) => patch({ totalMileageAllowance: v })}
            step={1000}
          />
          <NumberField
            label="Excess mileage fee"
            value={input.excessMileageFeePerMile}
            onChange={(v) => patch({ excessMileageFeePerMile: v })}
            prefix="$"
            suffix="/mi"
            step={0.01}
          />
        </div>
        <div className="mt-3">
          <NumberField
            label="Estimated wear & tear charges (if any)"
            value={input.estimatedWearAndTear}
            onChange={(v) => patch({ estimatedWearAndTear: v })}
            prefix="$"
            step={25}
          />
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          Full-term allowance is the whole lease&apos;s mileage limit (e.g. 10,000/yr × 3 years =
          30,000), not the annual figure — compare it against your actual odometer reading.
        </p>
      </div>

      <div className="flex items-start gap-2 text-xs leading-5 text-zinc-500">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <p>
          This is an estimate for comparison only — your lender&apos;s exact payoff quote, actual
          wear-and-tear charges, and your car&apos;s real resale value can all differ from what you
          enter here. Get an exact payoff quote from your lender before deciding.
        </p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Scale size={16} />
              {result.recommendation === "close" ? (
                <>It&apos;s close either way</>
              ) : result.recommendation === "buyout" ? (
                <>Buying out looks better</>
              ) : (
                <>Returning it looks better</>
              )}
            </p>
            <p className="text-sm text-zinc-400">
              {result.recommendation === "close" ? "Within" : "By about"}{" "}
              <span className="font-bold text-white">{formatCurrency(result.netAdvantage)}</span>
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs sm:grid-cols-4">
            <Result label="Buyout total cost" value={formatCurrency(result.buyoutTotalCost)} />
            <Result
              label="Net cost of buyout"
              value={`${result.netCostOfBuyout < 0 ? "-" : ""}${formatCurrency(Math.abs(result.netCostOfBuyout))}`}
              note={result.netCostOfBuyout < 0 ? "built-in equity" : "vs. market value"}
            />
            <Result label="Excess mileage fee" value={formatCurrency(result.excessMileageFee)} />
            <Result label="Return total cost" value={formatCurrency(result.returnTotalCost)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-zinc-500">{label}</span>
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

function Result({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-zinc-500">{label}</p>
      <p className="mt-0.5 font-bold text-white">{value}</p>
      {note && <p className="text-[10px] text-zinc-600">{note}</p>}
    </div>
  );
}
