"use client";

import { SORT_LABELS, type SortOption } from "@/lib/deal-utils";

const SORT_OPTIONS: SortOption[] = [
  "featured",
  "paymentLow",
  "paymentHigh",
  "msrpHigh",
  "dueLow",
  "effectiveLow",
  "newest",
  "discountHigh",
  "closest",
];

export default function SortBar({
  sortBy,
  onSortChange,
  resultCount,
}: {
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  resultCount: number;
}) {
  return (
    <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-fg-muted" aria-live="polite">
        Showing <span className="font-display text-base font-semibold text-fg">{resultCount}</span> deal
        {resultCount === 1 ? "" : "s"}
      </p>

      <label className="flex items-center gap-2 text-[13px] text-fg-muted">
        <span className="hidden sm:inline">Sort by</span>
        <span className="sr-only sm:hidden">Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="select select-sm"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
