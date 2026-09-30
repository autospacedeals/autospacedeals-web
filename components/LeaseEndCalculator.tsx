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
    <div className="space-y-6">
      <div className="panel">
        <p className="mb-3 text-sm font-medium text-fg">Buyout</p>
        <div className="grid grid-cols-2 items-end gap-4 lg:grid-cols-4">
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
        <p className="mt-2 text-[11px] text-fg-muted">
          Check what the car is actually worth right now (a dealer trade-in quote or a private-
          sale listing site) — that number is what makes this comparison meaningful.
        </p>
      </div>

      <div className="panel">
        <p className="mb-3 text-sm font-medium text-fg">Return</p>
        <div className="grid grid-cols-2 items-end gap-4 lg:grid-cols-4">
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
        <div className="mt-4">
          <NumberField
            label="Estimated wear & tear charges (if any)"
            value={input.estimatedWearAndTear}
            onChange={(v) => patch({ estimatedWearAndTear: v })}
            prefix="$"
            step={25}
          />
        </div>
        <p className="mt-2 text-[11px] text-fg-muted">
          Full-term allowance is the whole lease&apos;s mileage limit (e.g. 10,000 per year × 3 years =
          30,000), not the annual figure — compare it against your actual odometer reading.
        </p>
      </div>

      <div className="flex items-start gap-2 text-xs leading-5 text-fg-muted">
        <CircleAlert size={14} className="mt-0.5 shrink-0" />
        <p>
          This is an estimate for comparison only — your lender&apos;s exact payoff quote, actual
          wear-and-tear charges, and your car&apos;s real resale value can all differ from what you
          enter here. Get an exact payoff quote from your lender before deciding.
        </p>
      </div>

      <div data-results-bar="lease-end" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 backdrop-blur-xl">
        <div aria-hidden="true" className="light-bar absolute inset-x-0 top-0" />
        <div className="container-page max-w-4xl py-3 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="panel-title text-sm">
              <Scale />
              {result.recommendation === "close" ? (
                <>It&apos;s close either way</>
              ) : result.recommendation === "buyout" ? (
                <>Buying out looks better</>
              ) : (
                <>Returning it looks better</>
              )}
            </p>
            <p className="text-sm text-fg-secondary">
              {result.recommendation === "close" ? "Within" : "By about"}{" "}
              <span className="font-semibold text-fg">{formatCurrency(result.netAdvantage)}</span>
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs sm:grid-cols-4">
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
      <span className="field-label">{label}</span>
      <div className="input-group">
        {prefix && <span className="input-affix">{prefix}</span>}
        <input
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

function Result({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-fg-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-fg">{value}</p>
      {note && <p className="text-[11px] text-fg-muted">{note}</p>}
    </div>
  );
}
