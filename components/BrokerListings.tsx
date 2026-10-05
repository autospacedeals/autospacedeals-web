"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import {
  DEFAULT_FILTERS,
  MAX_PAYMENT_CEILING,
  SORT_LABELS,
  filterDeals,
  sortDeals,
  type SortOption,
} from "@/lib/deal-utils";
import DealCard from "@/components/DealCard";

// A lighter version of the homepage filters for one broker's inventory: a
// single toolbar (make, body style, max monthly, sort) instead of the full
// sidebar. Matching and sorting reuse the homepage's filterDeals/sortDeals,
// so a deal shows up (or doesn't) the same way on both pages.

// Below this many listings the toolbar is just clutter — show the grid.
const MIN_LISTINGS_FOR_FILTERS = 4;

const PAYMENT_CAPS = [500, 750, 1000, 1500];

const SORT_OPTIONS: SortOption[] = ["featured", "paymentLow", "paymentHigh", "msrpHigh", "dueLow", "newest"];

export default function BrokerListings({ deals }: { deals: Deal[] }) {
  const [make, setMake] = useState("All");
  const [bodyStyle, setBodyStyle] = useState("All");
  const [maxPayment, setMaxPayment] = useState(MAX_PAYMENT_CEILING);
  const [sortBy, setSortBy] = useState<SortOption>("featured");

  // Only offer what this broker actually has.
  const makes = useMemo(() => Array.from(new Set(deals.map((d) => d.make))).sort(), [deals]);
  const bodyStyles = useMemo(
    () =>
      Array.from(new Set(deals.map((d) => d.bodyStyle).filter((b): b is NonNullable<typeof b> => !!b))).sort(),
    [deals]
  );

  const results = useMemo(() => {
    const capped = maxPayment < MAX_PAYMENT_CEILING;
    const filtered = filterDeals(deals, {
      ...DEFAULT_FILTERS,
      make,
      bodyStyle,
      maxPayment,
      // One-pay deals store payment as 0, so a monthly cap would otherwise
      // match all of them — same rule as the homepage's "Under $500/mo".
      paymentType: capped ? "Monthly" : "All",
    });
    return sortDeals(filtered, sortBy, "All");
  }, [deals, make, bodyStyle, maxPayment, sortBy]);

  const isFiltered = make !== "All" || bodyStyle !== "All" || maxPayment < MAX_PAYMENT_CEILING;

  function reset() {
    setMake("All");
    setBodyStyle("All");
    setMaxPayment(MAX_PAYMENT_CEILING);
  }

  const showToolbar = deals.length >= MIN_LISTINGS_FOR_FILTERS;

  return (
    <div>
      {showToolbar && (
        <div className="mb-6 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            {makes.length > 1 && (
              <label>
                <span className="sr-only">Make</span>
                <select value={make} onChange={(e) => setMake(e.target.value)} className="select select-sm w-full sm:w-auto">
                  <option value="All">Any make</option>
                  {makes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {bodyStyles.length > 1 && (
              <label>
                <span className="sr-only">Body style</span>
                <select
                  value={bodyStyle}
                  onChange={(e) => setBodyStyle(e.target.value)}
                  className="select select-sm w-full sm:w-auto"
                >
                  <option value="All">Any body style</option>
                  {bodyStyles.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="sr-only">Max monthly payment</span>
              <select
                value={maxPayment}
                onChange={(e) => setMaxPayment(Number(e.target.value))}
                className="select select-sm w-full sm:w-auto"
              >
                <option value={MAX_PAYMENT_CEILING}>Any payment</option>
                {PAYMENT_CAPS.map((cap) => (
                  <option key={cap} value={cap}>
                    Under ${cap.toLocaleString()}/mo
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="select select-sm w-full sm:w-auto"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {SORT_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-sm text-fg-muted" aria-live="polite">
              {isFiltered ? (
                <>
                  Showing <span className="font-semibold text-fg">{results.length}</span> of {deals.length}
                </>
              ) : (
                <>
                  <span className="font-semibold text-fg">{deals.length}</span> deals
                </>
              )}
            </p>
            {isFiltered && (
              <button type="button" onClick={reset} className="btn btn-ghost btn-sm">
                <RotateCcw /> Reset
              </button>
            )}
          </div>
        </div>
      )}

      {results.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <div className="grid size-12 place-items-center rounded-full border border-line-strong bg-raised text-fg-muted">
            <Search size={20} />
          </div>
          <p className="type-title mt-5">No matching deals</p>
          <p className="mt-2 text-sm text-fg-muted">Try a different filter to see more of their inventory.</p>
          <button type="button" onClick={reset} className="btn btn-secondary mt-6">
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
