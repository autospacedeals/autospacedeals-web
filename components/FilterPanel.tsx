"use client";

import { SlidersHorizontal, RotateCcw } from "lucide-react";
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
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-white">
          <SlidersHorizontal size={16} /> Filters
        </p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
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
          label="Lease/finance term"
          value={filters.term}
          onChange={(v) => onChange({ term: v })}
          options={terms}
          suffix=" mo"
        />
        <Select
          label="Mileage allowance"
          value={filters.mileage}
          onChange={(v) => onChange({ mileage: v })}
          options={mileageOptions}
          suffix="/yr"
        />
      </div>

      <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
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
      <span className="mb-1 block text-xs font-semibold text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt === "All" ? `All ${label}` : `${opt}${suffix}`}
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
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold text-zinc-500">{label}</span>
        <span className="font-bold text-white">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white"
      />
    </div>
  );
}
