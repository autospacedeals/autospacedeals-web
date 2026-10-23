"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  ArrowRight,
  SlidersHorizontal,
  RotateCcw,
  X,
  ChevronDown,
  MapPin,
} from "lucide-react";
import type { Deal, BodyStyle, FuelType } from "@/lib/deals-data";
import { FILTER_URL_KEYS, filtersToParams } from "@/lib/filter-url";
import {
  DEFAULT_FILTERS,
  MAX_DAS_CEILING,
  MAX_PAYMENT_CEILING,
  filterDeals,
  formatCurrency,
  formatMileage,
  formatTerm,
  LAST_VIEWED_DEAL_KEY,
  SORT_LABELS,
  groupSameDeals,
  pickFeatured,
  sortDeals,
  parseSearch,
  trimKey,
  type DealFilters,
  type SortOption,
} from "@/lib/deal-utils";
import DealCard from "@/components/DealCard";
import HeroDealsCarousel from "@/components/HeroDealsCarousel";
import CompareModal from "@/components/CompareModal";
import FilterPanel from "@/components/FilterPanel";
import SortBar from "@/components/SortBar";
import { TaxZipBar } from "@/components/TaxRate";
import SaveSearchButton from "@/components/SaveSearchButton";
import {
  LAST_SEARCH_KEY,
  PENDING_SAVED_SEARCH_KEY,
  RETURN_TO_SEARCH,
  SAVED_SEARCH_QUERY_MAX,
  hasActiveFilters,
  parseSavedSearchFilters,
} from "@/lib/saved-searches";
import { nearestState } from "@/lib/us-geo";
import { cutoutSrc } from "@/lib/photo-src";

const ALL_BODY_STYLES: BodyStyle[] = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const ALL_FUEL_TYPES: FuelType[] = ["Gas", "Hybrid", "PHEV", "EV"];

// The category tabs over the grid. Each one only sets existing DealFilters
// fields (the same ones the filter panel controls), so a tab is also a
// linkable search; picking one clears the others' fields first. "Under
// $300" also sets Lease type to Monthly: one-pay deals store payment as 0,
// so they would otherwise match every monthly budget.
const TAB_KEYS = ["bodyStyle", "fuel", "maxPayment", "paymentType", "segment"] as const;
const TABS: { id: string; label: string; index?: string; patch: Partial<DealFilters> }[] = [
  { id: "all", label: "All deals", patch: {} },
  { id: "suv", label: "SUVs", index: "SUVs", patch: { bodyStyle: "SUV" } },
  { id: "sedan", label: "Sedans", index: "Sedans", patch: { bodyStyle: "Sedan" } },
  { id: "truck", label: "Trucks", index: "Trucks", patch: { bodyStyle: "Truck" } },
  { id: "ev", label: "Electric", index: "Electric", patch: { fuel: "EV" } },
  { id: "hybrid", label: "Hybrids", index: "Hybrids", patch: { fuel: "Hybrid" } },
  { id: "phev", label: "Plug-ins", index: "Plug-in hybrids", patch: { fuel: "PHEV" } },
  { id: "luxury", label: "Luxury", index: "Luxury", patch: { segment: "Luxury" } },
  { id: "budget", label: "Under $300", index: "Under $300 a month", patch: { maxPayment: 300, paymentType: "Monthly" } },
];

// Hero shortcuts under the search bar (same patches as the tabs).
const QUICK_PICKS = ["budget", "ev", "hybrid", "luxury"];

// The hero search's monthly budget options.
const MONTHLY_MAX = [300, 400, 500, 800, 1200];
const DUE_MAX = [0, 1000, 2000, 3000, 3500, 5000];

const ESSAY = [
  {
    title: "Every deal, the same format",
    text: "Payment, due at signing, term, miles and broker fee sit in the same place on every listing. You compare numbers, not ad copy.",
  },
  {
    title: "Posted by the seller",
    text: "Each deal comes from the dealer or broker offering it. Synced inventory updates on its own, and listings that look mistyped are held back.",
  },
  {
    title: "Talk to them directly",
    text: "Message the seller on Drive, no account needed: confirm your number with a texted code and replies come by text. Drive never charges shoppers.",
  },
];

// How many top deals the hero carousel steps through.
const HERO_DEALS = 6;
// Shown first in the hero when listed.
const HERO_LEAD = [{ make: "Audi", model: "S e-tron GT" }];

export default function HomeClient({
  initialDeals,
  savedSearchesAvailable = false,
  initialFilters = DEFAULT_FILTERS,
  initialSort = "featured",
  visitorPlace = null,
}: {
  initialDeals: Deal[];
  // "Irvine, CA", from the visitor's IP (Vercel's geo headers, read on the
  // server) — shown in the masthead's location chip. Never asks the browser.
  visitorPlace?: string | null;
  // The search in the page's address (lib/filter-url.ts), read on the server.
  initialFilters?: DealFilters;
  initialSort?: SortOption;
  // Whether saved searches can be used yet (the 0017 migration has been
  // run) — "Save this search" is hidden until then.
  savedSearchesAvailable?: boolean;
}) {
  const deals = initialDeals;
  const [filters, setFilters] = useState<DealFilters>(initialFilters);
  const [sortBy, setSortBy] = useState<SortOption>(initialSort);
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
    // "Back to your search" from a deal page (or the browser's back button):
    // put the shopper's filters and sort back. Re-validated, like above.
    try {
      const params = new URLSearchParams(window.location.search);
      const last = sessionStorage.getItem(LAST_SEARCH_KEY);
      const linked = FILTER_URL_KEYS.some((key) => params.has(key));
      if (!linked && params.get(RETURN_TO_SEARCH.param) === RETURN_TO_SEARCH.value && last) {
        const parsed = JSON.parse(last) as { filters?: unknown; sortBy?: unknown };
        const restored = parseSavedSearchFilters(parsed.filters);
        if (restored) setFilters(restored);
        if (typeof parsed.sortBy === "string" && parsed.sortBy in SORT_LABELS) {
          setSortBy(parsed.sortBy as SortOption);
        }
      }
    } catch {
      // Ignore — just falls back to the default filters.
    }
  }, []);

  // Remember the current search for the deal pages' "Back to your search",
  // and keep it in this page's address (lib/filter-url.ts) so it can be
  // shared and the browser's back button returns to it. Other params (an
  // ad's utm tags) are left alone. Back on the defaults, both are cleared.
  useEffect(() => {
    const searching = hasActiveFilters(filters) || sortBy !== "featured";
    try {
      if (searching) sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ filters, sortBy }));
      else sessionStorage.removeItem(LAST_SEARCH_KEY);
    } catch {
      // Ignore — the deal page just offers "Back to all deals".
    }
    const url = new URL(window.location.href);
    url.searchParams.delete(RETURN_TO_SEARCH.param);
    for (const key of FILTER_URL_KEYS) url.searchParams.delete(key);
    for (const [key, value] of filtersToParams(filters, sortBy)) url.searchParams.set(key, value);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [filters, sortBy]);

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

  // Recent cars from a spread of sellers and prices (pickFeatured), shown
  // large in the hero: studio stock photos only, since those cut out of
  // their backdrop cleanly (a seller's own photo, especially of a white car
  // on an off-white backdrop, can leave a ragged edge at that size).
  const spotlight = useMemo(() => {
    // Never a pending or sample listing: the hero shows no warnings.
    const showable = deals.filter((d) => d.inStock && !d.sample && d.images[0]);
    const studio = showable.filter((d) => d.photoAutoSourced);
    const pool = studio.length >= HERO_DEALS ? studio : showable;
    // The cars Rob wants leading the hero, when they're listed (cheapest
    // listing of each), then the usual spread.
    const lead = HERO_LEAD.map((want) =>
      pool
        .filter((d) => d.make === want.make && d.model === want.model && !d.onePay)
        .sort((a, b) => a.payment - b.payment)[0]
    ).filter((d): d is Deal => !!d);
    const rest = pickFeatured(pool.filter((d) => !lead.includes(d)), HERO_DEALS - lead.length);
    return [...lead, ...rest];
  }, [deals]);

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

  // The tab whose fields match the filters (All when none of them are set).
  const tabReset = Object.fromEntries(TAB_KEYS.map((k) => [k, DEFAULT_FILTERS[k]])) as Partial<DealFilters>;
  const activeTab =
    TABS.find((t) => TAB_KEYS.every((k) => filters[k] === (t.patch[k] ?? DEFAULT_FILTERS[k])))?.id ?? null;

  function scrollToDeals() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("deals")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function pickTab(id: string, scroll = false) {
    const tab = TABS.find((t) => t.id === id);
    if (!tab) return;
    updateFilters({ ...tabReset, ...tab.patch });
    if (scroll) scrollToDeals();
  }

  // A hero shortcut: pressing the active one goes back to All.
  function togglePick(id: string) {
    pickTab(activeTab === id ? "all" : id, true);
  }

  // The hero search's dropdown of extra filters, and the masthead's
  // location menu.
  const [heroMore, setHeroMore] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  const models = useMemo(() => {
    const pool = filters.make === "All" ? deals : deals.filter((d) => d.make === filters.make);
    return Array.from(new Set(pool.map((d) => d.model))).sort();
  }, [filters.make, deals]);

  // The chosen model's trims, one per spelling ("SEL Sport FWD" / "SEL SPORT
  // FWD" are one), named as most listings write it.
  const trims = useMemo(() => {
    if (filters.model === "All") return [];
    const byKey = new Map<string, Map<string, number>>();
    for (const d of deals) {
      if (d.model !== filters.model || (filters.make !== "All" && d.make !== filters.make) || !d.trim?.trim()) continue;
      const key = trimKey(d.trim);
      const names = byKey.get(key) ?? new Map<string, number>();
      names.set(d.trim.trim(), (names.get(d.trim.trim()) ?? 0) + 1);
      byKey.set(key, names);
    }
    return [...byKey.values()]
      .map((names) => [...names.entries()].sort((a, b) => b[1] - a[1])[0][0])
      .sort((a, b) => a.localeCompare(b));
  }, [filters.make, filters.model, deals]);

  // How many filters are set, for the phone's Filters button.
  const activeFilters = (Object.keys(DEFAULT_FILTERS) as (keyof DealFilters)[]).filter(
    (k) => k !== "query" && filters[k] !== DEFAULT_FILTERS[k]
  ).length;

  // On phones the filters open as a full-screen sheet: keep the page behind
  // it from scrolling.
  useEffect(() => {
    if (!showFilters || !window.matchMedia("(max-width: 1023.98px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showFilters]);

  const results = useMemo(() => {
    const filtered = filterDeals(deals, filters);
    // The manual "Location" filter still wins if the shopper set one —
    // auto-detected location only fills in when they've left it on "All".
    const referenceState = filters.state !== "All" ? filters.state : detectedState ?? "All";
    return sortDeals(filtered, sortBy, referenceState);
  }, [deals, filters, sortBy, detectedState]);
  // The same deal from several sellers shows as one card (lowest broker fee).
  const grouped = useMemo(() => groupSameDeals(results), [results]);

  // Each tab's count with everything else as set.
  const tabCounts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map((t) => [t.id, groupSameDeals(filterDeals(deals, { ...filters, ...tabReset, ...t.patch })).length])
      ),
    // tabReset is built from constants on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, filters]
  );

  // The index: every kind of car with its count and lowest payment today.
  const index = useMemo(
    () =>
      TABS.filter((t) => t.index).map((t) => {
        const found = groupSameDeals(filterDeals(deals, { ...DEFAULT_FILTERS, ...t.patch })).map((g) => g.deal);
        const monthly = found.filter((d) => !d.onePay && d.payment > 0).map((d) => d.payment);
        return { ...t, count: found.length, from: monthly.length ? Math.min(...monthly) : null };
      }),
    [deals]
  );

  const brandCount = useMemo(() => new Set(deals.map((d) => d.make)).size, [deals]);
  // The newest listing's date, for the masthead.
  const updated = useMemo(() => {
    const latest = deals.reduce((max, d) => (d.datePosted && d.datePosted > max ? d.datePosted : max), "");
    if (!latest) return null;
    return new Date(`${latest}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  }, [deals]);
  const indexPhoto = spotlight.find((d, i) => i > 0 && d.images[0]) ?? spotlight[0] ?? null;

  // Extra filters set from the hero's dropdown, for its count.
  const heroMoreSet =
    [filters.make, filters.model, filters.bodyStyle, filters.fuel, filters.mileage, filters.seller, filters.paymentType].filter(
      (v) => v !== "All"
    ).length + (filters.maxDueAtSigning < MAX_DAS_CEILING ? 1 : 0);
  const monthlyValue =
    filters.maxPayment >= MAX_PAYMENT_CEILING ? "any" : String(filters.maxPayment);

  // No results for a search with a fuel word ("Hyundai Kona EV"): what the
  // same search finds in other fuels, so the empty list explains itself.
  const otherFuels = useMemo(() => {
    if (grouped.length > 0) return null;
    const { fuels, text: query } = parseSearch(filters.query);
    if (fuels.length === 0) return null;
    const found = filterDeals(deals, { ...filters, query });
    if (found.length === 0) return null;
    const kinds = [...new Set(found.map((d) => (d.fuel === "EV" ? "electric" : (d.fuel ?? "").toLowerCase())).filter(Boolean))];
    const wanted = [...new Set(fuels.flat().map((f) => (f === "EV" ? "electric" : f.toLowerCase())))];
    return { query, count: found.length, kinds, wanted, what: query || "these filters" };
  }, [grouped.length, filters, deals]);

  return (
    <main>
      {/* ---------------------------------------------------------------- */}
      {/* Masthead line: where you are, how much is listed, how fresh */}
      {/* ---------------------------------------------------------------- */}
      <div className="container-page">
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line py-3 text-[11px] font-semibold tracking-[0.16em] text-fg-muted uppercase">
          <div className="relative">
            <button
              type="button"
              onClick={() => setLocOpen((v) => !v)}
              aria-expanded={locOpen}
              aria-haspopup="menu"
              className="inline-flex min-h-8 items-center gap-1.5 text-fg uppercase pointer-coarse:min-h-11"
            >
              <MapPin size={13} aria-hidden="true" />
              <span className="border-b border-line-hover pb-px">
                {filters.state !== "All"
                  ? `Deals in ${filters.state}`
                  : visitorPlace
                    ? `Deals near ${visitorPlace}`
                    : "Deals near you"}
              </span>
              <ChevronDown size={13} aria-hidden="true" className="text-fg-muted" />
            </button>
            {locOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 z-30 mt-2 min-w-52 animate-fade-in border border-rule-ink bg-canvas py-1 normal-case tracking-normal shadow-pop"
              >
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-[0.14em] text-fg-muted uppercase">Show deals in</p>
                {STATES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    role="menuitemradio"
                    aria-checked={filters.state === st}
                    onClick={() => {
                      updateFilters({ state: st });
                      setLocOpen(false);
                    }}
                    className="flex min-h-10 w-full items-center px-4 text-left text-sm font-medium text-fg-secondary hover:bg-hover hover:text-fg aria-checked:text-fg aria-checked:underline aria-checked:decoration-brand aria-checked:decoration-2 aria-checked:underline-offset-4"
                  >
                    {st === "All" ? "Anywhere" : st}
                  </button>
                ))}
                <p className="border-t border-line px-4 py-2 text-xs leading-5 text-fg-muted">
                  Cars that ship nationwide show everywhere.
                </p>
              </div>
            )}
          </div>
          {deals.length > 0 && (
            <span className="hidden sm:inline">
              {deals.length} live lease deals · {brandCount} brands · {sellerCount}{" "}
              {sellerCount === 1 ? "seller" : "sellers"}
            </span>
          )}
          {updated && <span className="hidden md:inline">Updated {updated}</span>}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="hero container-page pt-6 sm:pt-16">
        <div className="grid gap-x-6 lg:grid-cols-12">
          <h1 className="type-hero animate-fade-up lg:col-span-9 lg:text-[5.75rem] xl:text-[6.5rem]">
            Lease the car, <em>not</em> the showroom.
          </h1>
          <p className="mt-3.5 max-w-[28em] animate-fade-up font-serif text-[1.1875rem] leading-[1.35] text-fg-secondary [animation-delay:80ms] sm:mt-5 sm:text-2xl lg:col-span-9">
            Compare car lease deals from dealers and brokers in one place.
          </p>
        </div>

        {/* Phones go straight from the headline to the search; the featured
            car is for wider screens. */}
        {spotlight.length > 0 && (
          <div className="mt-2 hidden animate-fade-up [animation-delay:160ms] lg:block">
            <HeroDealsCarousel deals={spotlight} />
          </div>
        )}

        {/* The search, set between two rules */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setHeroMore(false);
            scrollToDeals();
          }}
          className="relative mt-5 grid grid-cols-2 border-t border-rule-ink sm:mt-8 lg:mt-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:border-b"
        >
          <label className="col-span-2 flex min-w-0 flex-col justify-center gap-1 border-b border-line py-2.5 pr-4 focus-within:shadow-[inset_0_-2px_0_var(--ring)] sm:py-3.5 lg:col-span-1 lg:border-r lg:border-b-0">
            <span className="label">Make or model</span>
            <span className="flex items-center gap-2">
              <Search size={17} aria-hidden="true" className="shrink-0 text-fg-muted" />
              <input
                value={filters.query}
                onChange={(e) => updateFilters({ query: e.target.value })}
                // Also the longest search a saved search accepts.
                maxLength={SAVED_SEARCH_QUERY_MAX}
                placeholder="Civic, RAV4, X5, a broker, a city…"
                aria-label="Search deals"
                className="h-9 min-w-0 flex-1 bg-transparent text-lg font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-muted"
              />
            </span>
          </label>
          <label className="flex min-w-0 flex-col justify-center gap-1 border-r border-b border-line py-2.5 pr-4 sm:py-3.5 lg:border-b-0 lg:pl-5">
            <span className="label">Monthly, up to</span>
            <select
              value={monthlyValue}
              onChange={(e) =>
                updateFilters(
                  e.target.value === "any"
                    ? { maxPayment: MAX_PAYMENT_CEILING, paymentType: filters.paymentType === "Monthly" ? "All" : filters.paymentType }
                    : { maxPayment: Number(e.target.value), paymentType: "Monthly" }
                )
              }
              className="select-line text-lg"
            >
              <option value="any">Any</option>
              {!MONTHLY_MAX.includes(filters.maxPayment) && monthlyValue !== "any" && (
                <option value={monthlyValue}>{formatCurrency(filters.maxPayment)}</option>
              )}
              {MONTHLY_MAX.map((v) => (
                <option key={v} value={String(v)}>
                  {formatCurrency(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col justify-center gap-1 border-b border-line py-2.5 pl-4 sm:py-3.5 lg:border-r lg:border-b-0 lg:pr-4 lg:pl-5">
            <span className="label">Term</span>
            <select value={filters.term} onChange={(e) => updateFilters({ term: e.target.value })} className="select-line text-lg">
              {TERMS.map((t) => (
                <option key={t} value={t}>
                  {t === "All" ? "Any" : formatTerm(Number(t))}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setHeroMore((v) => !v)}
            aria-expanded={heroMore}
            aria-controls="hero-more"
            className={`flex min-w-0 flex-col justify-center gap-1 border-r border-b border-line py-2.5 pr-4 text-left sm:py-3.5 lg:min-w-40 lg:border-b-0 lg:px-5 ${
              heroMore ? "lg:bg-hover-strong" : ""
            }`}
          >
            <span className="label">More filters</span>
            <span className="flex items-center justify-between gap-3 text-lg font-medium text-fg">
              {heroMoreSet ? `${heroMoreSet} set` : "Any"}
              <ChevronDown size={15} aria-hidden="true" className={`text-fg-muted transition-transform ${heroMore ? "rotate-180" : ""}`} />
            </span>
          </button>

          {heroMore && (
            <div
              id="hero-more"
              className="order-last col-span-2 animate-fade-in pb-4 lg:absolute lg:top-[calc(100%+10px)] lg:right-0 lg:left-0 lg:z-20 lg:border lg:border-rule-ink lg:bg-canvas lg:px-7 lg:pt-2 lg:pb-5 lg:shadow-pop"
            >
              <div className="grid grid-cols-2 gap-x-4 lg:grid-cols-4 lg:gap-x-7">
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Make</span>
                      <select value={filters.make} onChange={(e) => updateFilters({ make: e.target.value, model: "All", trim: "All" })} className={`select-line mt-0.5 ${filters.make !== "All" ? "select-line-set" : ""}`}>
                        {MAKES.map((m) => (
                          <option key={m} value={m}>
                            {m === "All" ? "Any make" : m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Model</span>
                      <select value={filters.model} onChange={(e) => updateFilters({ model: e.target.value, trim: "All" })} className={`select-line mt-0.5 ${filters.model !== "All" ? "select-line-set" : ""}`}>
                        <option value="All">{filters.make === "All" ? "Any model" : `Any ${filters.make}`}</option>
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Body style</span>
                      <select value={filters.bodyStyle} onChange={(e) => updateFilters({ bodyStyle: e.target.value })} className={`select-line mt-0.5 ${filters.bodyStyle !== "All" ? "select-line-set" : ""}`}>
                        {["All", ...ALL_BODY_STYLES].map((b) => (
                          <option key={b} value={b}>
                            {b === "All" ? "Any body style" : b}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Fuel type</span>
                      <select value={filters.fuel} onChange={(e) => updateFilters({ fuel: e.target.value })} className={`select-line mt-0.5 ${filters.fuel !== "All" ? "select-line-set" : ""}`}>
                        {["All", ...ALL_FUEL_TYPES].map((f) => (
                          <option key={f} value={f}>
                            {f === "All" ? "Any fuel" : f === "EV" ? "Electric" : f === "PHEV" ? "Plug-in hybrid" : f}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Due at signing, up to</span>
                      <select
                        value={String(filters.maxDueAtSigning)}
                        onChange={(e) => updateFilters({ maxDueAtSigning: Number(e.target.value) })}
                        className={`select-line mt-0.5 ${filters.maxDueAtSigning < MAX_DAS_CEILING ? "select-line-set" : ""}`}
                      >
                        <option value={String(MAX_DAS_CEILING)}>Any</option>
                        {!DUE_MAX.includes(filters.maxDueAtSigning) && filters.maxDueAtSigning < MAX_DAS_CEILING && (
                          <option value={String(filters.maxDueAtSigning)}>{formatCurrency(filters.maxDueAtSigning)}</option>
                        )}
                        {DUE_MAX.map((v) => (
                          <option key={v} value={String(v)}>
                            {v === 0 ? "$0 down" : formatCurrency(v)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Miles a year</span>
                      <select value={filters.mileage} onChange={(e) => updateFilters({ mileage: e.target.value })} className={`select-line mt-0.5 ${filters.mileage !== "All" ? "select-line-set" : ""}`}>
                        {MILEAGE_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m === "All" ? "Any mileage" : formatMileage(Number(m))}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Broker / dealer</span>
                      <select value={filters.seller} onChange={(e) => updateFilters({ seller: e.target.value })} className={`select-line mt-0.5 ${filters.seller !== "All" ? "select-line-set" : ""}`}>
                        {SELLERS.map((m) => (
                          <option key={m} value={m}>
                            {m === "All" ? "Any seller" : m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block border-b border-line pt-3 pb-2">
                      <span className="label">Lease type</span>
                      <select value={filters.paymentType} onChange={(e) => updateFilters({ paymentType: e.target.value })} className={`select-line mt-0.5 ${filters.paymentType !== "All" ? "select-line-set" : ""}`}>
                        {["All", "Monthly", "One-pay"].map((m) => (
                          <option key={m} value={m}>
                            {m === "All" ? "Any lease type" : m === "Monthly" ? "Monthly payments" : "One payment upfront"}
                          </option>
                        ))}
                      </select>
                    </label>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-[13px] text-fg-muted underline underline-offset-[3px] hover:text-fg"
                >
                  Clear all
                </button>
                <button type="submit" className="btn btn-primary hidden lg:inline-flex">
                  Show {grouped.length} {grouped.length === 1 ? "deal" : "deals"} <ArrowRight />
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary my-2 ml-3 h-auto min-h-12 gap-2 px-3 text-sm whitespace-nowrap sm:my-3 sm:ml-4 sm:gap-3 sm:px-6 sm:text-[15px] lg:my-0 lg:ml-0 lg:min-h-[4.5rem] lg:px-8"
          >
            Show {grouped.length} {grouped.length === 1 ? "deal" : "deals"} <ArrowRight />
          </button>
        </form>

        <div className="no-scrollbar mt-3 flex items-baseline gap-x-5 gap-y-1 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:overflow-visible">
          <span className="label shrink-0">Popular</span>
          {QUICK_PICKS.map((id) => {
            const tab = TABS.find((t) => t.id === id)!;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={activeTab === id}
                onClick={() => togglePick(id)}
                className="font-serif text-lg text-fg-secondary italic underline decoration-line-hover underline-offset-[5px] transition-colors hover:text-fg hover:decoration-fg aria-pressed:text-fg aria-pressed:decoration-fg"
              >
                {tab.index}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Deals + filters */}
      {/* ---------------------------------------------------------------- */}
      <section id="deals" className="container-page scroll-mt-20 pt-11 pb-8 sm:pt-28">
        <div className="mb-6 grid items-end gap-x-6 gap-y-3 lg:grid-cols-12">
          <h2 className="type-section text-[2.75rem] sm:text-[4rem] lg:col-span-7">The deals</h2>
          <p className="hidden font-serif text-base text-fg-secondary sm:block lg:col-span-4 lg:col-start-9">
            Every listing on Drive, from the dealers and brokers offering them. Payments are before
            tax unless a listing says otherwise.
          </p>
        </div>

        {/* Category tabs */}
        <div role="tablist" aria-label="Kind of car" className="no-scrollbar -mx-4 flex gap-x-7 overflow-x-auto border-b border-rule-ink px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => pickTab(t.id)}
              className="-mb-px shrink-0 border-b-2 border-transparent pt-3 pb-3 text-[15px] font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg aria-selected:border-fg aria-selected:text-fg"
            >
              {t.label}
              <span className="ml-1.5 text-[11.5px] text-fg-muted tabular-nums">{tabCounts[t.id]}</span>
            </button>
          ))}
        </div>

        {/* Phones: the Filters button stays pinned top right while scrolling
            the deals, for shoppers who know what they want. */}
        <div className="sticky top-16 z-30 -mx-4 mt-3 mb-2 flex items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:hidden">
          <p className="text-sm text-fg-secondary">
            <strong className="font-semibold text-fg">{grouped.length}</strong> {grouped.length === 1 ? "deal" : "deals"}
          </p>
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            aria-expanded={showFilters}
            aria-controls="deal-filters"
            className="btn btn-secondary btn-pill btn-sm"
          >
            <SlidersHorizontal /> Filters
            {activeFilters > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] leading-5 font-semibold text-on-accent">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        <div className="mt-2 grid gap-10 lg:mt-8 lg:grid-cols-[250px_minmax(0,1fr)] xl:gap-14">
          {/* On desktop the sticky panel scrolls on its own when it's taller
              than the window, so its footer (Save this search) stays reachable. */}
          <aside
            id="deal-filters"
            aria-label="Filters"
            className={`${showFilters ? "fixed inset-0 z-50 flex flex-col bg-canvas" : "hidden"} lg:sticky lg:inset-auto lg:top-24 lg:z-auto lg:block lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:bg-transparent lg:pb-1`}
          >
            {/* Phone sheet header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 lg:hidden">
              <p className="label text-fg">Filters</p>
              <div className="-mr-2 flex items-center gap-1">
                <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="btn btn-ghost btn-sm">
                  <RotateCcw /> Reset
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  aria-label="Close filters"
                  className="btn btn-ghost btn-icon btn-sm"
                >
                  <X />
                </button>
              </div>
            </div>
            {/* The panel's own title row is the sheet header on phones. */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4 max-lg:[&_[data-filter-head]]:hidden lg:contents">
              <FilterPanel
                filters={filters}
                onChange={updateFilters}
                makes={MAKES}
                models={models}
                trims={trims}
                bodyStyles={ALL_BODY_STYLES}
                fuels={ALL_FUEL_TYPES}
                sellers={SELLERS}
                states={STATES}
                terms={TERMS}
                mileageOptions={MILEAGE_OPTIONS}
                footer={<SaveSearchButton filters={filters} available={savedSearchesAvailable} />}
              />
            </div>
            {/* Phone sheet footer */}
            <div className="shrink-0 border-t border-line p-4 lg:hidden">
              <button type="button" onClick={() => setShowFilters(false)} className="btn btn-primary w-full">
                Show {grouped.length} {grouped.length === 1 ? "deal" : "deals"}
              </button>
            </div>
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
            <div className="flex flex-wrap items-center gap-3 pb-1">
              <SortBar sortBy={sortBy} onSortChange={setSortBy} resultCount={grouped.length} />
              <TaxZipBar className="w-full" />
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

            {grouped.length > 0 ? (
              <div className="mt-6 grid gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
                {grouped.map(({ deal, others }, i) => (
                  <div
                    key={deal.id}
                    id={`deal-${deal.id}`}
                    className="h-full animate-fade-up"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  >
                    <DealCard
                      deal={deal}
                      otherSellers={others}
                      compareSelected={compareIds.includes(deal.id)}
                      compareDisabled={compareIds.length >= MAX_COMPARE}
                      onToggleCompare={() => toggleCompare(deal.id)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex flex-col items-center border-t border-rule-ink px-6 py-16 text-center">
                <div className="grid size-12 place-items-center rounded-full border border-line-hover text-fg-muted">
                  <Search size={20} />
                </div>
                {otherFuels ? (
                  <>
                    <p className="type-title mt-5">No {otherFuels.wanted.join(" or ")} matches right now</p>
                    <p className="mt-2 max-w-md text-sm text-fg-muted">
                      There {otherFuels.count === 1 ? "is" : "are"} {otherFuels.count} {otherFuels.kinds.join(" / ")}{" "}
                      {otherFuels.count === 1 ? "deal" : "deals"} for &ldquo;{otherFuels.what}&rdquo;.
                    </p>
                    <button
                      type="button"
                      onClick={() => updateFilters({ query: otherFuels.query })}
                      className="btn btn-secondary mt-6"
                    >
                      Show {otherFuels.count === 1 ? "it" : "them"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="type-title mt-5">No deals found</p>
                    <p className="mt-2 text-sm text-fg-muted">
                      Try widening your filters or resetting the search.
                    </p>
                    <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="btn btn-secondary mt-6">
                      Reset filters
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The index */}
      {/* ---------------------------------------------------------------- */}
      <section id="index" aria-label="Browse by kind" className="container-page pt-20 sm:pt-28">
        <div className="mb-8 grid items-end gap-x-6 gap-y-3 lg:grid-cols-12">
          <h2 className="type-section text-[2.75rem] sm:text-[4rem] lg:col-span-7">The index</h2>
          <p className="font-serif text-base text-fg-secondary lg:col-span-4 lg:col-start-9">
            Eight ways into the inventory. The price beside each is the lowest monthly payment
            listed today.
          </p>
        </div>
        <div className="grid gap-x-6 lg:grid-cols-12">
          <ol className="border-t border-rule-ink lg:col-span-7">
            {index.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => pickTab(t.id, true)}
                  className="group/row grid w-full grid-cols-[2rem_1fr_auto] items-baseline gap-3 border-b border-line py-4 text-left sm:grid-cols-[3.25rem_1fr_auto_auto] sm:gap-6 sm:py-5"
                >
                  <span className="text-[13px] font-semibold text-fg-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-serif text-[1.6rem] leading-tight text-fg group-hover/row:italic sm:text-[2.125rem]">{t.index}</span>
                  <span className="hidden text-[13px] text-fg-muted sm:inline">
                    {t.count} {t.count === 1 ? "deal" : "deals"}
                  </span>
                  <span className="min-w-0 text-right text-sm font-semibold text-fg tabular-nums sm:min-w-28 sm:text-[15px]">
                    {t.from != null ? `from ${formatCurrency(t.from)}/mo` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {indexPhoto && (
            <figure className="mt-10 hidden self-center lg:col-span-4 lg:col-start-9 lg:mt-0 lg:block">
              <div className="media-stage aspect-[4/3]">
                <img src={cutoutSrc(indexPhoto.images[0])} alt="" loading="lazy" className="media-img" />
              </div>
              <figcaption className="mt-2 border-t border-line pt-2.5 font-serif text-[15px] text-fg-secondary italic">
                {indexPhoto.year} {indexPhoto.make} {indexPhoto.model}
                {indexPhoto.trim ? ` ${indexPhoto.trim}` : ""}.{" "}
                {indexPhoto.onePay
                  ? `${formatCurrency(indexPhoto.dueAtSigning)} one-pay`
                  : `${formatCurrency(indexPhoto.payment)} a month, ${indexPhoto.term} months.`}
              </figcaption>
            </figure>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* What a lease really costs */}
      {/* ---------------------------------------------------------------- */}
      <section aria-label="What a lease really costs" className="container-page pt-20 sm:pt-28">
        <div className="grid gap-x-6 gap-y-6 lg:grid-cols-12">
          <blockquote className="font-serif text-[1.875rem] leading-[1.14] tracking-[-0.015em] text-fg sm:text-[3.25rem] lg:col-span-8 lg:col-start-2">
            A $225 payment with $3,500 due at signing is really a <em className="text-brand">$361</em> payment.
            Drive prints both.
          </blockquote>
          <div className="self-end border-t border-rule-ink pt-3 text-sm leading-7 tabular-nums lg:col-span-3 lg:col-start-10">
            <p className="label mb-1.5">Real cost per month</p>
            ($3,500 + $225 × 23) ÷ 24
            <br />= $361.46
            <p className="mt-2 text-[12.5px] leading-5 text-fg-muted">
              The due at signing covers the first month, so 23 payments follow it.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works */}
      {/* ---------------------------------------------------------------- */}
      <section id="how" className="container-page pt-20 sm:pt-28">
        <h2 className="type-section mb-8 text-[2.75rem] sm:text-[4rem]">
          On leasing, <em>plainly</em>
        </h2>
        <div className="grid gap-x-12 gap-y-9 border-t border-rule-ink pt-7 md:grid-cols-3">
          {ESSAY.map((step, i) => (
            <div key={step.title}>
              <span className="font-serif text-[1.375rem] text-brand italic">{["i.", "ii.", "iii."][i]}</span>
              <h3 className="mt-3 font-display text-2xl leading-tight font-semibold tracking-[-0.015em] text-fg [font-variation-settings:'wdth'_104]">
                {step.title}
              </h3>
              <p className="mt-2.5 font-serif text-[1.0625rem] leading-[1.55] text-fg-secondary">{step.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 max-w-3xl border-t border-line pt-4 font-serif text-base text-fg-secondary">
          <span className="label mr-3 text-fg">A note on credit</span>
          Advertised lease prices usually assume very good credit. The seller checks yours before
          anything is final, and the price can change.
        </p>
      </section>

      {compareIds.length > 0 && !showCompare && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex animate-rise justify-center px-4">
          <div
            role="region"
            aria-label="Compare tray"
            className="pointer-events-auto flex w-full max-w-2xl items-center gap-4 rounded-[2px] bg-accent py-2.5 pr-2.5 pl-3.5 text-on-accent shadow-pop"
          >
            <div className="hidden gap-1.5 sm:flex">
              {Array.from({ length: MAX_COMPARE }, (_, i) => {
                const d = deals.find((x) => x.id === compareIds[i]);
                return d ? (
                  <span key={i} className="media-stage grid h-9 w-14 place-items-center rounded-[2px] [--stage:#f2f0eb]">
                    <img src={cutoutSrc(d.images[0])} alt="" className="media-img" />
                  </span>
                ) : (
                  <span key={i} aria-hidden="true" className="h-9 w-14 rounded-[2px] border border-dashed border-current opacity-40" />
                );
              })}
            </div>
            <p className="min-w-0 flex-1 text-sm leading-tight">
              <span className="font-semibold whitespace-nowrap">
                {compareIds.length} deal{compareIds.length > 1 ? "s" : ""} selected
              </span>
              <span className="opacity-75">
                {compareIds.length < 2 ? " · pick at least one more" : compareIds.length < MAX_COMPARE ? " · add one more, or compare now" : ""}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-sm underline underline-offset-[3px] opacity-80 hover:opacity-100"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={compareIds.length < 2}
              onClick={() => setShowCompare(true)}
              className="btn btn-sm h-10 bg-canvas px-5 text-fg disabled:opacity-50"
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
