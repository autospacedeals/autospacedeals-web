"use client";

import { SORT_LABELS, type SortOption } from "@/lib/deal-utils";

const SORT_OPTIONS: SortOption[] = [
  "featured",
  "paymentLow",
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-zinc-400">
        Showing <span className="font-semibold text-white">{resultCount}</span> deal
        {resultCount === 1 ? "" : "s"}
      </p>

      <label className="flex items-center gap-2 text-sm text-zinc-400">
        Sort by
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white outline-none"
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
