"use client";

import { useState } from "react";
import { RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { BodyStyle, FuelType } from "@/lib/deals-data";
import {
  DEFAULT_FILTERS,
  MAX_DAS_CEILING,
  MAX_PAYMENT_CEILING,
  formatCurrency,
  type DealFilters,
  formatMileage,
  formatTerm,
} from "@/lib/deal-utils";

interface FilterPanelProps {
  filters: DealFilters;
  onChange: (patch: Partial<DealFilters>) => void;
  makes: string[];
  models: string[];
  // Trims of the chosen model (shown once a model is picked).
  trims?: string[];
  bodyStyles: BodyStyle[];
  fuels: FuelType[];
  sellers: string[];
  states: string[];
  terms: string[];
  mileageOptions: string[];
  // Rendered below the sliders (the homepage's "Save this search").
  footer?: React.ReactNode;
}

export default function FilterPanel({
  filters,
  onChange,
  makes,
  models,
  trims = [],
  bodyStyles,
  fuels,
  sellers,
  states,
  terms,
  mileageOptions,
  footer,
}: FilterPanelProps) {
  // Make, model and body style are what most shoppers reach for; the rest
  // sit under "More filters" (with a count of how many are set) so the
  // panel doesn't front-load nine dropdowns before you've glanced at a car.
  const moreSet = [filters.fuel, filters.seller, filters.state, filters.term, filters.paymentType, filters.mileage].filter(
    (v) => v !== "All"
  ).length;
  const [showMore, setShowMore] = useState(moreSet > 0);
  const anySet = (Object.keys(DEFAULT_FILTERS) as (keyof DealFilters)[]).some(
    (k) => k !== "query" && filters[k] !== DEFAULT_FILTERS[k]
  );

  return (
    <div>
      <div data-filter-head className="flex items-baseline justify-between border-b border-rule-ink pb-2.5">
        <p className="label text-fg">Filters</p>
        {anySet && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-fg-muted underline underline-offset-[3px] transition-colors hover:text-fg"
          >
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-1">
        <Select
          label="Make"
          value={filters.make}
          onChange={(v) => onChange({ make: v, model: "All", trim: "All" })}
          options={makes}
        />
        <Select
          label="Model"
          value={filters.model}
          onChange={(v) => onChange({ model: v, trim: "All" })}
          options={["All", ...models]}
        />
        {filters.model !== "All" && trims.length > 0 && (
          <Select
            label="Trim"
            value={filters.trim}
            onChange={(v) => onChange({ trim: v })}
            options={["All", ...trims]}
          />
        )}
        <Select
          label="Body style"
          value={filters.bodyStyle}
          onChange={(v) => onChange({ bodyStyle: v })}
          options={["All", ...bodyStyles]}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="flex min-h-12 w-full items-center justify-between gap-2 border-b border-line text-sm font-semibold text-fg pointer-coarse:min-h-12"
      >
        <span className="flex items-center gap-2">
          More filters
          {moreSet > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1.5 text-[10.5px] font-bold text-on-accent">
              {moreSet}
            </span>
          )}
        </span>
        {showMore ? <ChevronUp size={15} className="text-fg-muted" /> : <ChevronDown size={15} className="text-fg-muted" />}
      </button>

      {showMore && (
        <div className="grid animate-fade-in sm:grid-cols-2 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-1">
          <Select
            label="Fuel type"
            value={filters.fuel}
            onChange={(v) => onChange({ fuel: v })}
            options={["All", ...fuels]}
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
            format={(opt) => formatTerm(Number(opt))}
          />
          <Select
            label="Lease type"
            value={filters.paymentType}
            onChange={(v) => onChange({ paymentType: v })}
            options={["All", "Monthly", "One-pay"]}
          />
          <Select
            label="Mileage allowance"
            value={filters.mileage}
            onChange={(v) => onChange({ mileage: v })}
            options={mileageOptions}
            format={(opt) => formatMileage(Number(opt))}
          />
        </div>
      )}

      <div className="space-y-1">
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

      {footer}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  format = (opt: string) => opt,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  format?: (opt: string) => string;
}) {
  return (
    <label className="block border-b border-line pt-3 pb-2">
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`select-line mt-0.5 ${value !== "All" ? "select-line-set" : ""}`}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "All" ? `Any ${label.toLowerCase()}` : format(opt)}
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
    <div className="border-b border-line pt-4 pb-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-fg-secondary">{label}</span>
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
