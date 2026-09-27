"use client";

import { useState } from "react";
import { SlidersHorizontal, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { BodyStyle, FuelType } from "@/lib/deals-data";
import {
  DEFAULT_FILTERS,
  MAX_DAS_CEILING,
  MAX_PAYMENT_CEILING,
  formatCurrency,
  type DealFilters,
} from "@/lib/deal-utils";

interface FilterPanelProps {
  filters: DealFilters;
  onChange: (patch: Partial<DealFilters>) => void;
  makes: string[];
  models: string[];
  bodyStyles: BodyStyle[];
  fuels: FuelType[];
  sellers: string[];
  states: string[];
  terms: string[];
  mileageOptions: string[];
}

export default function FilterPanel({
  filters,
  onChange,
  makes,
  models,
  bodyStyles,
  fuels,
  sellers,
  states,
  terms,
  mileageOptions,
}: FilterPanelProps) {
  // Fuel type and mileage allowance are used far less often than the fields
  // above them — tucked behind a toggle so the panel doesn't front-load 9
  // dropdowns before you've even glanced at a car.
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="panel">
      <div className="mb-5 flex items-center justify-between">
        <p className="panel-title">
          <SlidersHorizontal /> Filters
        </p>
        <button type="button" onClick={() => onChange(DEFAULT_FILTERS)} className="btn btn-ghost btn-sm -mr-2 px-3">
          <RotateCcw /> Reset
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1">
        <Select
          label="Make"
          value={filters.make}
          onChange={(v) => onChange({ make: v, model: "All" })}
          options={makes}
        />
        <Select
          label="Model"
          value={filters.model}
          onChange={(v) => onChange({ model: v })}
          options={["All", ...models]}
        />
        <Select
          label="Body style"
          value={filters.bodyStyle}
          onChange={(v) => onChange({ bodyStyle: v })}
          options={["All", ...bodyStyles]}
        />
        <Select
          label="Broker/dealer"
          value={filters.seller}
          onChange={(v) => onChange({ seller: v })}
          options={sellers}
        />
        <Select
          label="Location"
          value={filters.state}
          onChange={(v) => onChange({ state: v })}
          options={states}
        />
        <Select
          label="Lease term"
          value={filters.term}
          onChange={(v) => onChange({ term: v })}
          options={terms}
          suffix=" mo"
        />
        <Select
          label="Lease type"
          value={filters.paymentType}
          onChange={(v) => onChange({ paymentType: v })}
          options={["All", "Monthly", "One-pay"]}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="mt-4 inline-flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg pointer-coarse:min-h-11"
      >
        {showMore ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showMore ? "Fewer filters" : "More filters"}
      </button>

      {showMore && (
        <div className="mt-3 grid animate-fade-in gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1">
          <Select
            label="Fuel type"
            value={filters.fuel}
            onChange={(v) => onChange({ fuel: v })}
            options={["All", ...fuels]}
          />
          <Select
            label="Mileage allowance"
            value={filters.mileage}
            onChange={(v) => onChange({ mileage: v })}
            options={mileageOptions}
            suffix="/yr"
          />
        </div>
      )}

      <div className="mt-5 space-y-5 border-t border-line pt-5">
        <RangeField
          label="Max monthly payment"
          value={filters.maxPayment}
          min={200}
          max={MAX_PAYMENT_CEILING}
          step={25}
          display={
            filters.maxPayment >= MAX_PAYMENT_CEILING
              ? "Any"
              : `${formatCurrency(filters.maxPayment)}/mo`
          }
          onChange={(v) => onChange({ maxPayment: v })}
        />
        <RangeField
          label="Max due at signing"
          value={filters.maxDueAtSigning}
          min={0}
          max={MAX_DAS_CEILING}
          step={250}
          display={
            filters.maxDueAtSigning >= MAX_DAS_CEILING
              ? "Any"
              : formatCurrency(filters.maxDueAtSigning)
          }
          onChange={(v) => onChange({ maxDueAtSigning: v })}
        />
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  suffix = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="select">
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "All" ? `Any ${label.toLowerCase()}` : `${opt}${suffix}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-secondary">{label}</span>
        <span className="text-[13px] font-semibold text-fg">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range"
        style={{ "--range-pct": `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
}
