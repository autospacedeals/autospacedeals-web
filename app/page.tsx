"use client";

import React, { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Gauge,
  CalendarDays,
  ExternalLink,
  Star,
  Car,
  ShieldCheck,
} from "lucide-react";

const deals = [
  {
    id: 1,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    trim: "Base",
    msrp: 64000,
    payment: 459,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "Vegas Red",
    interior: "Red",
    fuel: "EV",
    region: "CA",
    broker: "Chrome Stallions",
    brokerFee: 599,
    badge: "EV",
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["Premium", "Parking Assist", "Driving Assistance", "Shadowline"],
  },
  {
    id: 2,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    trim: "M-Sport",
    msrp: 65000,
    payment: 469,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "White",
    interior: "Red",
    fuel: "EV",
    region: "CA",
    broker: "Chrome Stallions",
    brokerFee: 599,
    badge: "HOT",
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["M-Sport", "Premium", '19" Wheels', "Extended Shadowline"],
  },
  {
    id: 3,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    trim: "M-Sport",
    msrp: 67000,
    payment: 485,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "White",
    interior: "Black",
    fuel: "EV",
    region: "CA",
    broker: "Chrome Stallions",
    brokerFee: 599,
    badge: "NEW",
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["M-Sport", "Shadowline", "Premium", "Parking Assistance"],
  },
  {
    id: 4,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    trim: "M-Package",
    msrp: 67000,
    payment: 489,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "Black",
    interior: "Red",
    fuel: "EV",
    region: "CA",
    broker: "Chrome Stallions",
    brokerFee: 599,
    badge: "VALUE",
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["M-Package", "Shadowline", "Premium"],
  },
  {
    id: 7,
    year: 2026,
    make: "Audi",
    model: "Q5",
    trim: "Premium Plus",
    payment: 589,
    dueAtSigning: 3500,
    msrp: 58240,
    term: 36,
    miles: 10000,
    exterior: "White",
    interior: "Black",
    fuel: "Gas",
    broker: "test",
    brokerFee: 599,
    region: "CA",
    notes: "Loyalty incentive included",
    packages: ["Premium Plus", "Navigation"],
    badge: "HOT",
  },
  {
    id: 8,
    year: 2025,
    make: "Tesla",
    model: "Model 3",
    trim: "Long Range",
    payment: 499,
    dueAtSigning: 2500,
    msrp: 52990,
    term: 36,
    miles: 12000,
    exterior: "Gray",
    interior: "White",
    fuel: "EV",
    broker: "test",
    brokerFee: 399,
    region: "NY",
    notes: "Includes conquest rebate",
    packages: ["Long Range"],
    badge: "EV",
  },
  {
    id: 9,
    year: 2025,
    make: "Honda",
    model: "CR-V Hybrid",
    trim: "Sport Touring",
    payment: 429,
    dueAtSigning: 2999,
    msrp: 41250,
    term: 39,
    miles: 10000,
    exterior: "Blue",
    interior: "Black",
    fuel: "Hybrid",
    broker: "test",
    brokerFee: 499,
    region: "NJ",
    notes: "Tax not included",
    packages: ["Touring Package"],
    badge: "VALUE",
  },
  {
    id: 10,
    year: 2025,
    make: "Porsche",
    model: "Macan",
    trim: "Base",
    payment: 899,
    dueAtSigning: 7000,
    msrp: 68400,
    term: 36,
    miles: 7500,
    exterior: "Black",
    interior: "Red",
    fuel: "Gas",
    broker: "test",
    brokerFee: 799,
    region: "FL",
    notes: "Demo unit special",
    packages: ["Sport Chrono"],
    badge: "NEW",
  },
];

const brands = ["All", ...Array.from(new Set(deals.map((deal) => deal.make)))];
const regions = ["All", ...Array.from(new Set(deals.map((deal) => deal.region)))];

const brandImages: Record<string, string> = {
  BMW: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80",
  Audi: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=80",
  Tesla: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=1200&q=80",
  Honda: "https://images.unsplash.com/photo-1617469767053-d3b523a0b982?auto=format&fit=crop&w=1200&q=80",
  Porsche: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80",
};

const fallbackImage =
  "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80";

export default function AutoSpaceDealsMVP() {
  const [brand, setBrand] = useState("All");
  const [region, setRegion] = useState("All");
  const [fuel, setFuel] = useState("All");
  const [term, setTerm] = useState("All");
  const [sortBy, setSortBy] = useState("featured");
  const [maxPayment, setMaxPayment] = useState(1000);
  const [maxDueAtSigning, setMaxDueAtSigning] = useState(10000);
  const [query, setQuery] = useState("");
  const [selectedDeal, setSelectedDeal] = useState<any | null>(null);

  const filteredDeals = useMemo(() => {
    const search = query.trim().toLowerCase();

    const filtered = deals.filter((deal) => {
      const matchesBrand = brand === "All" || deal.make === brand;
      const matchesRegion = region === "All" || deal.region === region;
      const matchesFuel = fuel === "All" || deal.fuel === fuel;
      const matchesTerm = term === "All" || String(deal.term) === term;
      const matchesPayment = deal.payment <= maxPayment;
      const matchesDueAtSigning = deal.dueAtSigning <= maxDueAtSigning;

      const searchableText = [
        deal.year,
        deal.make,
        deal.model,
        deal.trim,
        deal.region,
        deal.exterior,
        deal.interior,
        deal.broker,
        deal.notes,
        deal.fuel,
        ...(deal.packages || []),
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = search === "" || searchableText.includes(search);

      return (
        matchesBrand &&
        matchesRegion &&
        matchesFuel &&
        matchesTerm &&
        matchesPayment &&
        matchesDueAtSigning &&
        matchesQuery
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "paymentLow") return a.payment - b.payment;
      if (sortBy === "paymentHigh") return b.payment - a.payment;
      if (sortBy === "dueLow") return a.dueAtSigning - b.dueAtSigning;
      if (sortBy === "dueHigh") return b.dueAtSigning - a.dueAtSigning;
      if (sortBy === "newest") return b.year - a.year;
      return 0;
    });
  }, [brand, region, fuel, term, sortBy, maxPayment, maxDueAtSigning, query]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-zinc-950">
              <Car size={22} />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">AutoSpace Deals</p>
              <p className="text-xs text-zinc-400">Curated broker lease deals</p>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
            <a href="#deals" className="hover:text-white">
              Deals
            </a>
            <a href="#brokers" className="hover:text-white">
              Brokers
            </a>
            <a href="#how" className="hover:text-white">
              How it works
            </a>
            <a href="/leasing-guide" className="hover:text-white">
              Leasing Guide
            </a>
          </nav>

          <button className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200">
            Submit a Deal
          </button>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.22),transparent_30%)]" />

          <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-[1.15fr_0.85fr] md:py-28">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300">
                <ShieldCheck size={16} /> Broker-approved listings, simplified.
              </div>

              <h1 className="max-w-3xl text-5xl font-black tracking-tight md:text-7xl">
                Your one-stop marketplace for the best dealer and broker auto lease deals.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
                AutoSpace Deals organizes broker-submitted lease offers into clean, searchable listings with payments, due at signing, term, mileage, region, and broker contact info.
              </p>

              <div className="mt-8 rounded-3xl border border-white/10 bg-white/10 p-3 shadow-2xl backdrop-blur">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  <div className="flex items-center gap-3 rounded-2xl bg-zinc-950 px-4 py-3">
                    <Search className="text-zinc-400" size={20} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search BMW, EV, broker..."
                      className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                    />
                  </div>

                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm outline-none"
                  >
                    {brands.map((b) => (
                      <option key={b} value={b}>
                        {b === "All" ? "All Brands" : b}
                      </option>
                    ))}
                  </select>

                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm outline-none"
                  >
                    {regions.map((r) => (
                      <option key={r} value={r}>
                        {r === "All" ? "All Regions" : r}
                      </option>
                    ))}
                  </select>

                  <select
                    value={fuel}
                    onChange={(e) => setFuel(e.target.value)}
                    className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm outline-none"
                  >
                    <option value="All">All Fuel Types</option>
                    <option value="Gas">Gas</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="EV">EV</option>
                  </select>

                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm outline-none"
                  >
                    <option value="All">All Terms</option>
                    <option value="24">24 Months</option>
                    <option value="36">36 Months</option>
                    <option value="39">39 Months</option>
                    <option value="48">48 Months</option>
                  </select>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-zinc-950 px-4 py-3">
                    <SlidersHorizontal size={18} className="text-zinc-400" />
                    <div className="w-full">
                      <div className="mb-1 flex justify-between text-xs text-zinc-400">
                        <span>Max Payment</span>
                        <span>${maxPayment}/mo</span>
                      </div>
                      <input
                        type="range"
                        min="300"
                        max="1000"
                        step="50"
                        value={maxPayment}
                        onChange={(e) => setMaxPayment(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl bg-zinc-950 px-4 py-3">
                    <SlidersHorizontal size={18} className="text-zinc-400" />
                    <div className="w-full">
                      <div className="mb-1 flex justify-between text-xs text-zinc-400">
                        <span>Max DAS</span>
                        <span>${maxDueAtSigning.toLocaleString()}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10000"
                        step="500"
                        value={maxDueAtSigning}
                        onChange={(e) => setMaxDueAtSigning(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm outline-none"
                  >
                    <option value="featured">Featured</option>
                    <option value="paymentLow">Lowest Payment</option>
                    <option value="paymentHigh">Highest Payment</option>
                    <option value="dueLow">Lowest DAS</option>
                    <option value="dueHigh">Highest DAS</option>
                    <option value="newest">Newest Year</option>
                  </select>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-zinc-400">
                  <span>
                    Showing {filteredDeals.length} deal
                    {filteredDeals.length === 1 ? "" : "s"}
                  </span>

                  <button
                    onClick={() => {
                      setBrand("All");
                      setRegion("All");
                      setFuel("All");
                      setTerm("All");
                      setSortBy("featured");
                      setMaxPayment(1000);
                      setMaxDueAtSigning(10000);
                      setQuery("");
                    }}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/10"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
              <div className="rounded-[1.5rem] bg-gradient-to-br from-zinc-800 to-zinc-950 p-6">
                <p className="text-sm text-zinc-400">Featured example</p>
                <h2 className="mt-3 text-3xl font-black">2026 BMW i4 eDrive40</h2>

                <div className="mt-8 grid grid-cols-2 gap-4">
                  <Stat label="Monthly" value="$459" />
                  <Stat label="Due at signing" value="$3,500" />
                  <Stat label="Term" value="36 mo" />
                  <Stat label="Mileage" value="7.5k/yr" />
                </div>

                <a
                  href="#deals"
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 font-bold text-zinc-950"
                >
                  View Deals <ExternalLink size={18} />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="deals" className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">
                Marketplace
              </p>
              <h2 className="mt-2 text-4xl font-black">Featured Lease Deals</h2>
            </div>
          </div>

          {filteredDeals.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {filteredDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} onSelect={setSelectedDeal} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center">
              <p className="text-2xl font-black">No deals found</p>
              <p className="mt-2 text-zinc-400">
                Try adjusting your filters or resetting the search.
              </p>
            </div>
          )}
        </section>

        <section id="how" className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-7xl gap-5 px-6 py-16 md:grid-cols-3">
            <InfoCard
              title="Broker permission first"
              text="Deals are cross-posted only from brokers who approve their listings being featured."
            />
            <InfoCard
              title="Standardized deal format"
              text="Payments, DAS, term, mileage, region, fee, and source details are organized consistently."
            />
            <InfoCard
              title="Easy customer handoff"
              text="Customers can contact the broker directly so the broker keeps the lead and closes the deal."
            />
          </div>
        </section>

        {selectedDeal && (
          <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
        )}
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-10 text-sm text-zinc-500 md:flex-row">
        <p>© 2026 AutoSpace Deals. All rights reserved.</p>
        <p>Built for curated automotive lease discovery.</p>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function DealCard({
  deal,
  onSelect,
}: {
  deal: any;
  onSelect: (deal: any) => void;
}) {
  const image = brandImages[deal.make] || fallbackImage;

  return (
    <article
      onClick={() => onSelect(deal)}
      className="cursor-pointer rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-1 hover:bg-white/[0.08]"
    >
      <div className="mb-5 overflow-hidden rounded-2xl bg-zinc-900">
        <img
          src={image}
          alt={`${deal.make} ${deal.model}`}
          className="h-52 w-full object-cover transition duration-300 hover:scale-105"
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-950">
          {deal.badge}
        </span>
        <span className="flex items-center gap-1 text-xs text-zinc-400">
          <Star size={14} /> {deal.fuel}
        </span>
      </div>

      <h3 className="text-2xl font-black">{deal.make}</h3>
      <p className="mt-1 text-lg font-semibold text-zinc-200">{deal.model}</p>
      <p className="text-sm text-zinc-500">{deal.trim}</p>

      <div className="mt-6 border-t border-white/10 pt-5">
        <p className="text-sm text-zinc-400">Monthly payment</p>
        <p className="text-4xl font-black">
          ${deal.payment}
          <span className="text-base font-medium text-zinc-500">/mo</span>
        </p>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-zinc-300">
        <div className="flex items-center justify-between">
          <span>DAS</span>
          <strong>${deal.dueAtSigning.toLocaleString()}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>MSRP</span>
          <strong>${deal.msrp.toLocaleString()}</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Term</span>
          <strong>{deal.term} months</strong>
        </div>
        <div className="flex items-center justify-between">
          <span>Miles</span>
          <strong>{deal.miles.toLocaleString()}/yr</strong>
        </div>
      </div>

      <div className="mt-5 space-y-2 text-sm text-zinc-400">
        <p className="flex items-center gap-2">
          <MapPin size={16} /> {deal.region}
        </p>
        <p className="flex items-center gap-2">
          <Gauge size={16} /> Broker fee: ${deal.brokerFee}
        </p>
        <p className="flex items-center gap-2">
          <CalendarDays size={16} /> Broker: {deal.broker}
        </p>
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-6 rounded-2xl bg-white p-1"
      >
        <details className="group">
          <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-center font-bold text-zinc-950 transition hover:bg-zinc-200">
            Contact Broker
          </summary>

          <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-zinc-950">
            <p className="text-sm font-bold">Contact Broker</p>
            <p className="mt-1 text-sm text-zinc-600">
              Choose how you want to reach us.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <a
                href="tel:7475558899"
                className="rounded-xl bg-zinc-950 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-zinc-800"
              >
                Call
              </a>

              <a
                href="sms:7475558899"
                className="rounded-xl bg-zinc-200 px-4 py-3 text-center text-sm font-bold text-zinc-950 transition hover:bg-zinc-300"
              >
                Text
              </a>
            </div>

            <p className="mt-3 text-center text-xs text-zinc-500">
              747-555-8899
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}

function DealModal({ deal, onClose }: { deal: any; onClose: () => void }) {
  const image = brandImages[deal.make] || fallbackImage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-zinc-400">{deal.make}</p>
            <h2 className="text-3xl font-black">
              {deal.year} {deal.model}
            </h2>
            <p className="mt-1 text-zinc-400">{deal.region}</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl bg-zinc-900">
          <img
            src={image}
            alt={`${deal.make} ${deal.model}`}
            className="h-72 w-full object-cover"
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Stat label="Monthly" value={`$${deal.payment}/mo`} />
          <Stat label="Due at Signing" value={`$${deal.dueAtSigning}`} />
          <Stat label="Term" value={`${deal.term} mo`} />
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 p-5">
          <h3 className="text-lg font-bold">Deal Details</h3>
          <div className="mt-4 space-y-2 text-zinc-300">
            <p>Region: {deal.region}</p>
            <p>Fuel: {deal.fuel}</p>
            <p>Exterior: {deal.exterior}</p>
            <p>Interior: {deal.interior}</p>
            <p>Broker: {deal.broker}</p>
            <p>Broker Fee: ${deal.brokerFee}</p>
            <p>Mileage: {deal.miles.toLocaleString()}/yr</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 p-5">
          <h3 className="text-lg font-bold">Incentives & Packages</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {deal.packages?.map((item: string) => (
              <span
                key={item}
                className="rounded-full bg-white/10 px-3 py-1 text-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 p-5">
          <h3 className="text-lg font-bold">Notes</h3>
          <p className="mt-3 leading-7 text-zinc-300">{deal.notes}</p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 leading-7 text-zinc-400">{text}</p>
    </div>
  );
}