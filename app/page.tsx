"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck, Car, ArrowRight, SlidersHorizontal, Store, Users } from "lucide-react";
import {
  deals,
  MAKES,
  BODY_STYLES,
  STATES,
  FUEL_TYPES,
  SELLERS,
  TERMS,
  MILEAGE_OPTIONS,
} from "@/lib/deals-data";
import {
  DEFAULT_FILTERS,
  filterDeals,
  sortDeals,
  type DealFilters,
  type SortOption,
} from "@/lib/deal-utils";
import DealCard from "@/components/DealCard";
import FilterPanel from "@/components/FilterPanel";
import SortBar from "@/components/SortBar";

const sellerCount = new Set(deals.map((d) => d.sellerName)).size;
const stateCount = new Set(deals.map((d) => d.state)).size;

export default function HomePage() {
  const [filters, setFilters] = useState<DealFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>("featured");
  const [showFilters, setShowFilters] = useState(false);

  const updateFilters = (patch: Partial<DealFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const models = useMemo(() => {
    const pool = filters.make === "All" ? deals : deals.filter((d) => d.make === filters.make);
    return Array.from(new Set(pool.map((d) => d.model))).sort();
  }, [filters.make]);

  const results = useMemo(() => {
    const filtered = filterDeals(deals, filters);
    return sortDeals(filtered, sortBy, filters.state);
  }, [filters, sortBy]);

  return (
    <main>
      {/* ---------------------------------------------------------------- */}
      {/* Hero */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.2),transparent_30%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 sm:text-sm">
              <ShieldCheck size={15} /> Broker &amp; dealer deals, verified and organized
            </div>

            <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Compare real lease &amp; finance deals in one place.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Stop digging through dealer sites, broker posts, and forum threads. AutoSpace Deals
              organizes offers from dealers and brokers into clean listings with real payments,
              due at signing, term, mileage, and direct contact info.
            </p>

            <div className="mx-auto mt-8 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 p-2 shadow-2xl backdrop-blur">
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-zinc-950 px-4 py-3">
                <Search className="shrink-0 text-zinc-400" size={18} />
                <input
                  value={filters.query}
                  onChange={(e) => updateFilters({ query: e.target.value })}
                  placeholder="Search make, model, broker, city..."
                  className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                />
              </div>
              <a
                href="#deals"
                className="hidden shrink-0 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 sm:block"
              >
                Search
              </a>
            </div>

            <div className="mx-auto mt-8 grid max-w-lg grid-cols-3 gap-4 text-center">
              <HeroStat value={`${deals.length}+`} label="Active deals" />
              <HeroStat value={`${sellerCount}`} label="Dealers &amp; brokers" />
              <HeroStat value={`${stateCount}`} label="States covered" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Deals + filters */}
      {/* ---------------------------------------------------------------- */}
      <section id="deals" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">
              Marketplace
            </p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">Featured Lease &amp; Finance Deals</h2>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 lg:hidden"
          >
            <SlidersHorizontal size={16} /> {showFilters ? "Hide Filters" : "Show Filters"}
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <aside className={`${showFilters ? "block" : "hidden"} lg:sticky lg:top-24 lg:block lg:h-fit`}>
            <FilterPanel
              filters={filters}
              onChange={updateFilters}
              makes={MAKES}
              models={models}
              bodyStyles={BODY_STYLES}
              fuels={FUEL_TYPES}
              sellers={SELLERS}
              states={STATES}
              terms={TERMS}
              mileageOptions={MILEAGE_OPTIONS}
            />
          </aside>

          <div className="min-h-[70vh]">
            <SortBar sortBy={sortBy} onSortChange={setSortBy} resultCount={results.length} />

            {results.length > 0 ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {results.map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center">
                <p className="text-2xl font-black">No deals found</p>
                <p className="mt-2 text-zinc-400">
                  Try widening your filters or resetting the search.
                </p>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-zinc-950"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* How it works */}
      {/* ---------------------------------------------------------------- */}
      <section id="how" className="border-y border-white/10 bg-white/[0.03]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="mb-2 text-center text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">
            How it works
          </p>
          <h2 className="mb-10 text-center text-3xl font-black sm:text-4xl">
            A simpler way to shop for a deal
          </h2>

          <div className="grid gap-5 md:grid-cols-3">
            <InfoCard
              icon={ShieldCheck}
              title="Broker permission first"
              text="Deals are cross-posted only from dealers and brokers who approve their listings being featured here."
            />
            <InfoCard
              icon={SlidersHorizontal}
              title="Standardized deal format"
              text="Payments, due at signing, term, mileage, location, fees, and source details are organized consistently so deals are easy to compare."
            />
            <InfoCard
              icon={Car}
              title="Easy seller handoff"
              text="Shoppers contact the dealer or broker directly, so the seller keeps the lead and closes the deal — no middleman."
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* For dealers & brokers */}
      {/* ---------------------------------------------------------------- */}
      <section id="brokers" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="grid items-center gap-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-10 md:grid-cols-[1fr_auto]">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">
              <Store size={16} /> For Dealers &amp; Brokers
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              Get your inventory in front of ready-to-buy shoppers.
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-zinc-300">
              List your dealer or broker deals on AutoSpace Deals for free while we&apos;re in
              early access. You keep every lead — shoppers contact you directly by phone, text,
              or email.
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
              <Users size={15} /> {sellerCount} dealers &amp; brokers already listed
            </p>
          </div>

          <a
            href="mailto:list@autospacedeals.example?subject=I%20want%20to%20list%20deals%20on%20AutoSpace%20Deals"
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
          >
            List Your Deals <ArrowRight size={16} />
          </a>
        </div>
      </section>
    </main>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-black sm:text-3xl">{value}</p>
      <p className="text-xs text-zinc-400 sm:text-sm">{label}</p>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
        <Icon size={20} />
      </div>
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 leading-7 text-zinc-400">{text}</p>
    </div>
  );
}
