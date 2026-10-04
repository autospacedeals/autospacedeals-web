"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import type { Deal, BodyStyle, FuelType } from "@/lib/deals-data";
import {
  DEFAULT_FILTERS,
  filterDeals,
  formatCurrency,
  LAST_VIEWED_DEAL_KEY,
  sortDeals,
  type DealFilters,
  type SortOption,
} from "@/lib/deal-utils";
import DealCard from "@/components/DealCard";
import HeroDealsCarousel from "@/components/HeroDealsCarousel";
import CompareModal from "@/components/CompareModal";
import FilterPanel from "@/components/FilterPanel";
import SortBar from "@/components/SortBar";
import SaveSearchButton from "@/components/SaveSearchButton";
import {
  PENDING_SAVED_SEARCH_KEY,
  SAVED_SEARCH_QUERY_MAX,
  parseSavedSearchFilters,
} from "@/lib/saved-searches";
import { nearestState } from "@/lib/us-geo";

const ALL_BODY_STYLES: BodyStyle[] = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const ALL_FUEL_TYPES: FuelType[] = ["Gas", "Hybrid", "PHEV", "EV"];

// Hero shortcuts. Each one only sets existing DealFilters fields (the same
// ones the filter panel controls) and scrolls to the grid; pressing an
// active one resets just those fields. "Under $500/mo" also sets Lease type
// to Monthly: one-pay deals store payment as 0, so they would otherwise
// match every monthly budget.
const QUICK_PICKS: { label: string; patch: Partial<DealFilters> }[] = [
  { label: "SUV", patch: { bodyStyle: "SUV" } },
  { label: "Sedan", patch: { bodyStyle: "Sedan" } },
  { label: "Electric", patch: { fuel: "EV" } },
  { label: "Under $500/mo", patch: { maxPayment: 500, paymentType: "Monthly" } },
  { label: "One-pay", patch: { paymentType: "One-pay" } },
];

const STEPS = [
  { title: "Real offers from sellers", text: "Dealers and brokers post their current lease deals themselves." },
  {
    title: "Every deal, same format",
    text: "Payment, due at signing, term, mileage and fees laid out the same way, so you can compare side by side.",
  },
  {
    title: "Message the seller here",
    text: "Ask questions or lock in a deal without handing out your number. Every conversation stays on record.",
  },
];

// How many top deals the hero carousel steps through.
const HERO_DEALS = 6;

export default function HomeClient({
  initialDeals,
  savedSearchesAvailable = false,
}: {
  initialDeals: Deal[];
  // Whether saved searches can be used yet (the 0017 migration has been
  // run) — "Save this search" is hidden until then.
  savedSearchesAvailable?: boolean;
}) {
  const deals = initialDeals;
  const [filters, setFilters] = useState<DealFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [showFilters, setShowFilters] = useState(false);
  // The deal a shopper clicked into last visit (see markDealViewed) — used to
  // reopen on the same car instead of resetting to the top of the list.
  // "Back to all deals" is a full navigation that remounts this component, so
  // it's carried in localStorage and consumed (cleared) once applied.
  const [restoreDealId, setRestoreDealId] = useState<string | null>(null);
  const restoredScrollRef = useRef(false);

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const MAX_COMPARE = 3;

  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }

  // Load the last-viewed deal once the page is hydrated (avoids an SSR
  // hydration mismatch, since the server renders with nothing to restore).
  useEffect(() => {
    try {
      const lastDeal = localStorage.getItem(LAST_VIEWED_DEAL_KEY);
      if (lastDeal) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRestoreDealId(lastDeal);
        localStorage.removeItem(LAST_VIEWED_DEAL_KEY);
      }
    } catch {
      // Ignore — just falls back to no restore.
    }
    // Filters a signed-out shopper tried to save before logging in (see
    // SaveSearchButton) — put back so they only have to press Save again.
    // Read once and cleared; re-validated, since storage is editable. The
    // panel is opened too, so the Save button is in view on small screens
    // (where the filters start collapsed).
    try {
      const pending = sessionStorage.getItem(PENDING_SAVED_SEARCH_KEY);
      if (pending) {
        sessionStorage.removeItem(PENDING_SAVED_SEARCH_KEY);
        const restored = parseSavedSearchFilters(JSON.parse(pending));
        if (restored) {
          setFilters(restored);
          setShowFilters(true);
        }
      }
    } catch {
      // Ignore — just falls back to the default filters.
    }
  }, []);

  // Once there's a deal to restore (and any pending filters above have been
  // applied), scroll it into view. Runs once per visit (restoredScrollRef
  // guards it).
  useEffect(() => {
    if (!restoreDealId || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const el = document.getElementById(`deal-${restoreDealId}`);
    el?.scrollIntoView({ block: "center" });
    setRestoreDealId(null);
  }, [restoreDealId]);

  // "Closest to my location" used to never actually ask for the shopper's
  // location at all — picking it with the Location filter left on "All"
  // just silently left the list in its existing order, while the label
  // implied it already knew where they were. Request it lazily, only once
  // this sort is actually selected, and surface honestly what happened
  // either way instead of a mysterious no-op.
  const [detectedState, setDetectedState] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "pending" | "granted" | "denied" | "unavailable">(
    "idle"
  );

  useEffect(() => {
    if (sortBy !== "closest" || geoStatus !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const state = nearestState(pos.coords.latitude, pos.coords.longitude);
        setDetectedState(state);
        setGeoStatus(state ? "granted" : "unavailable");
      },
      () => setGeoStatus("denied"),
      { maximumAge: 10 * 60 * 1000, timeout: 8000 }
    );
  }, [sortBy, geoStatus]);

  const sellerCount = useMemo(() => new Set(deals.map((d) => d.sellerName)).size, [deals]);

  // Hero stats line + desktop "Deals" carousel (display only).
  const lowestMonthly = useMemo(() => {
    const payments = deals.filter((d) => !d.onePay && d.payment > 0).map((d) => d.payment);
    return payments.length ? Math.min(...payments) : null;
  }, [deals]);
  const spotlight = useMemo(() => sortDeals(deals, "featured", "All").slice(0, HERO_DEALS), [deals]);

  const MAKES = useMemo(() => ["All", ...Array.from(new Set(deals.map((d) => d.make))).sort()], [deals]);
  const SELLERS = useMemo(
    () => ["All", ...Array.from(new Set(deals.map((d) => d.sellerName))).sort()],
    [deals]
  );
  const STATES = useMemo(() => ["All", ...Array.from(new Set(deals.map((d) => d.state))).sort()], [deals]);
  const TERMS = useMemo(
    () => [
      "All",
      ...Array.from(new Set(deals.map((d) => String(d.term)))).sort((a, b) => Number(a) - Number(b)),
    ],
    [deals]
  );
  const MILEAGE_OPTIONS = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(deals.filter((d) => d.milesPerYear != null).map((d) => String(d.milesPerYear)))
      ).sort((a, b) => Number(a) - Number(b)),
    ],
    [deals]
  );

  const updateFilters = (patch: Partial<DealFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  function isPicked(patch: Partial<DealFilters>) {
    return Object.entries(patch).every(([key, value]) => filters[key as keyof DealFilters] === value);
  }

  function togglePick(patch: Partial<DealFilters>) {
    if (isPicked(patch)) {
      const reset = Object.fromEntries(
        Object.keys(patch).map((key) => [key, DEFAULT_FILTERS[key as keyof DealFilters]])
      ) as Partial<DealFilters>;
      updateFilters(reset);
    } else {
      updateFilters(patch);
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("deals")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  const models = useMemo(() => {
    const pool = filters.make === "All" ? deals : deals.filter((d) => d.make === filters.make);
    return Array.from(new Set(pool.map((d) => d.model))).sort();
  }, [filters.make, deals]);

  const results = useMemo(() => {
    const filtered = filterDeals(deals, filters);
    // The manual "Location" filter still wins if the shopper set one —
    // auto-detected location only fills in when they've left it on "All".
    const referenceState = filters.state !== "All" ? filters.state : detectedState ?? "All";
    return sortDeals(filtered, sortBy, referenceState);
  }, [deals, filters, sortBy, detectedState]);

  return (
    <main>
      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="hero">
        <div aria-hidden="true" className="hero-glow" />
        <div aria-hidden="true" className="hero-road" />

        <div
          className={`container-page grid items-center gap-12 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:gap-16 ${
            spotlight ? "lg:grid-cols-[minmax(0,1fr)_400px]" : ""
          }`}
        >
          <div className="min-w-0">
            <h1 className="type-hero max-w-[12ch] animate-fade-up">Find your next lease deal.</h1>
            <p className="lede mt-5 max-w-xl animate-fade-up [animation-delay:80ms]">
              Real offers from dealers and brokers. Compare them side by side, then contact the
              seller directly.
            </p>

            <div className="search-bar mt-8 max-w-2xl animate-fade-up [animation-delay:160ms]">
              <Search size={18} className="shrink-0 text-fg-muted" />
              <input
                value={filters.query}
                onChange={(e) => updateFilters({ query: e.target.value })}
                // Also the longest search a saved search accepts.
                maxLength={SAVED_SEARCH_QUERY_MAX}
                placeholder="Search make, model, broker, city..."
                aria-label="Search deals"
              />
              <a href="#deals" className="btn btn-primary max-sm:w-11 max-sm:px-0">
                <span className="max-sm:sr-only">Search</span>
                <ArrowRight aria-hidden="true" className="sm:hidden" />
              </a>
            </div>

            <div className="no-scrollbar -mx-4 mt-4 flex animate-fade-up items-center gap-2 overflow-x-auto px-4 py-1 [animation-delay:220ms] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <span className="mr-1 shrink-0 text-[13px] text-fg-muted">Popular</span>
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick.label}
                  type="button"
                  className="chip"
                  aria-pressed={isPicked(pick.patch)}
                  onClick={() => togglePick(pick.patch)}
                >
                  {pick.label}
                </button>
              ))}
            </div>

            {deals.length > 0 && (
              <p className="mt-7 animate-fade-up text-sm text-fg-muted [animation-delay:280ms]">
                <span className="font-semibold text-fg">{deals.length}</span> live deal{deals.length === 1 ? "" : "s"} from{" "}
                <span className="font-semibold text-fg">{sellerCount}</span>{" "}
                {sellerCount === 1 ? "dealer or broker" : "dealers & brokers"}
                {lowestMonthly != null && (
                  <>
                    {" "}
                    · payments from <span className="font-semibold text-fg">{formatCurrency(lowestMonthly)}/mo</span>
                  </>
                )}
              </p>
            )}
          </div>

          {spotlight.length > 0 && (
            <div className="hidden animate-fade-up [animation-delay:200ms] lg:block">
              <HeroDealsCarousel deals={spotlight} />
            </div>
          )}
        </div>

        <div aria-hidden="true" className="hero-horizon" />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Deals + filters */}
      {/* ---------------------------------------------------------------- */}
      <section id="deals" className="container-page pt-16 pb-24 sm:pt-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Marketplace</p>
            <h2 className="type-section mt-3">Featured lease deals</h2>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="btn btn-secondary btn-sm lg:hidden"
          >
            <SlidersHorizontal /> {showFilters ? "Hide filters" : "Show filters"}
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[272px_minmax(0,1fr)]">
          {/* On desktop the sticky panel scrolls on its own when it's taller
              than the window, so its footer (Save this search) stays reachable. */}
          <aside
            className={`${showFilters ? "block" : "hidden"} lg:sticky lg:top-24 lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:pb-1`}
          >
            <FilterPanel
              filters={filters}
              onChange={updateFilters}
              makes={MAKES}
              models={models}
              bodyStyles={ALL_BODY_STYLES}
              fuels={ALL_FUEL_TYPES}
              sellers={SELLERS}
              states={STATES}
              terms={TERMS}
              mileageOptions={MILEAGE_OPTIONS}
              footer={<SaveSearchButton filters={filters} available={savedSearchesAvailable} />}
            />
          </aside>

          <div className="min-h-[70vh] min-w-0">
            {sortBy === "closest" && filters.state === "All" && (
              <p className="mb-3 text-xs text-fg-muted">
                {geoStatus === "pending" && "Finding your location…"}
                {geoStatus === "granted" &&
                  (detectedState
                    ? `Showing deals closest to ${detectedState} based on your device's location.`
                    : "Couldn't match your location to a state — showing deals in default order.")}
                {geoStatus === "denied" &&
                  "Location access denied, so we can't sort by distance — showing deals in default order. Pick a state under Location to sort by hand instead."}
                {geoStatus === "unavailable" &&
                  "Location isn't available on this device/browser — showing deals in default order. Pick a state under Location to sort by hand instead."}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
              <SortBar sortBy={sortBy} onSortChange={setSortBy} resultCount={results.length} />
            </div>

            {/* Small screens, filters collapsed: the panel's Save button is
                out of sight, so a compact one appears here once the list has
                been narrowed (e.g. with the hero search or a quick pick). */}
            {!showFilters && (
              <SaveSearchButton
                filters={filters}
                available={savedSearchesAvailable}
                compact
                className="mt-4 lg:hidden"
              />
            )}

            {results.length > 0 ? (
              <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((deal, i) => (
                  <div
                    key={deal.id}
                    id={`deal-${deal.id}`}
                    className="h-full animate-fade-up"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  >
                    <DealCard
                      deal={deal}
                      compareSelected={compareIds.includes(deal.id)}
                      compareDisabled={compareIds.length >= MAX_COMPARE}
                      onToggleCompare={() => toggleCompare(deal.id)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="card mt-6 flex flex-col items-center px-6 py-16 text-center">
                <div className="grid size-12 place-items-center rounded-full border border-line-strong bg-raised text-fg-muted">
                  <Search size={20} />
                </div>
                <p className="type-title mt-5">No deals found</p>
                <p className="mt-2 text-sm text-fg-muted">
                  Try widening your filters or resetting the search.
                </p>
                <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="btn btn-secondary mt-6">
                  Reset filters
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works */}
      {/* ---------------------------------------------------------------- */}
      <section id="how" className="border-y border-line bg-surface">
        <div className="container-page grid gap-10 py-16 sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:py-20">
          <div className="sm:col-span-3 lg:col-span-1">
            <p className="eyebrow">How it works</p>
            <h2 className="type-section mt-3">Built for comparing.</h2>
          </div>
          {STEPS.map((step, i) => (
            <div key={step.title}>
              <p className="font-mono text-xs text-accent-fg">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-3 text-base font-semibold text-fg">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-fg-muted">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {compareIds.length > 0 && !showCompare && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex animate-rise justify-center px-4">
          <div
            role="region"
            aria-label="Compare tray"
            className="pointer-events-auto flex w-full max-w-lg items-center gap-3 rounded-full border border-line-strong bg-overlay/90 py-2 pr-2 pl-4 shadow-pop backdrop-blur-xl sm:pl-3"
          >
            <div className="hidden -space-x-2 sm:flex">
              {Array.from({ length: MAX_COMPARE }, (_, i) => {
                const d = deals.find((x) => x.id === compareIds[i]);
                return d ? (
                  <img
                    key={i}
                    src={d.images[0]}
                    alt=""
                    className="size-9 rounded-full border-2 border-overlay bg-raised object-cover object-[50%_62%]"
                  />
                ) : (
                  <span key={i} aria-hidden="true" className="size-9 rounded-full border border-dashed border-line-strong bg-overlay" />
                );
              })}
            </div>
            <p className="min-w-0 flex-1 text-sm leading-tight">
              <span className="font-semibold whitespace-nowrap text-fg">
                {compareIds.length} deal{compareIds.length > 1 ? "s" : ""} selected
              </span>
              {compareIds.length < 2 && <span className="text-fg-muted"> — pick at least one more</span>}
            </p>
            <button type="button" onClick={() => setCompareIds([])} className="btn btn-ghost btn-sm px-3">
              Clear
            </button>
            <button
              type="button"
              disabled={compareIds.length < 2}
              onClick={() => setShowCompare(true)}
              className="btn btn-primary btn-sm"
            >
              Compare
            </button>
          </div>
        </div>
      )}

      {showCompare && (
        <CompareModal
          deals={compareIds.map((id) => deals.find((d) => d.id === id)).filter((d): d is Deal => !!d)}
          onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
          onClose={() => setShowCompare(false)}
        />
      )}
    </main>
  );
}
