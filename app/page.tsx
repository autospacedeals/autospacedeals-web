"use client";
import React, { useMemo, useState } from "react";
import { Search, SlidersHorizontal, MapPin, Gauge, CalendarDays, ExternalLink, Star, Car, ShieldCheck } from "lucide-react";

const deals = [
  {
    id: 1,
    make: "BMW",
    model: "i4 eDrive35",
    trim: "EV Sedan",
    payment: 399,
    das: 2500,
    term: 36,
    miles: 10000,
    msrp: 54695,
    region: "Southern California",
    broker: "OC Auto Broker",
    fee: 599,
    fuel: "EV",
    badge: "Strong EV Deal",
  },
  {
    id: 2,
    make: "Mercedes-Benz",
    model: "EQB 250+",
    trim: "SUV",
    payment: 459,
    das: 3000,
    term: 36,
    miles: 10000,
    msrp: 54800,
    region: "California",
    broker: "Premier Lease Group",
    fee: 699,
    fuel: "EV",
    badge: "Featured",
  },
  {
    id: 3,
    make: "Toyota",
    model: "Tacoma SR5",
    trim: "Double Cab",
    payment: 389,
    das: 1999,
    term: 36,
    miles: 12000,
    msrp: 42150,
    region: "West Coast",
    broker: "SoCal Fleet Deals",
    fee: 499,
    fuel: "Gas",
    badge: "Low DAS",
  },
  {
    id: 4,
    make: "Land Rover",
    model: "Defender 110",
    trim: "P400 SE",
    payment: 899,
    das: 4500,
    term: 36,
    miles: 7500,
    msrp: 82400,
    region: "California",
    broker: "Luxury Auto Source",
    fee: 899,
    fuel: "Gas",
    badge: "Luxury Pick",
  },
];

const brands = ["All", "BMW", "Mercedes-Benz", "Toyota", "Land Rover"];

export default function AutoSpaceDealsMVP() {
  const [brand, setBrand] = useState("All");
  const [maxPayment, setMaxPayment] = useState(1000);
  const [query, setQuery] = useState("");

  const filteredDeals = useMemo(() => {
    return deals.filter((deal) => {
      const matchesBrand = brand === "All" || deal.make === brand;
      const matchesPayment = deal.payment <= maxPayment;
      const text = `${deal.make} ${deal.model} ${deal.trim} ${deal.region} ${deal.broker}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      return matchesBrand && matchesPayment && matchesQuery;
    });
  }, [brand, maxPayment, query]);

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
            <a href="#deals" className="hover:text-white">Deals</a>
            <a href="#brokers" className="hover:text-white">Brokers</a>
            <a href="#how" className="hover:text-white">How it works</a>
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
                Find the best lease deals without digging through forums.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
                AutoSpace Deals organizes broker-submitted lease offers into clean, searchable listings with payments, due at signing, term, mileage, region, and broker contact info.
              </p>

              <div className="mt-8 rounded-3xl border border-white/10 bg-white/10 p-3 shadow-2xl backdrop-blur">
                <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <div className="flex items-center gap-3 rounded-2xl bg-zinc-950 px-4 py-3">
                    <Search className="text-zinc-400" size={20} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search BMW, Tacoma, EV, broker..."
                      className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                    />
                  </div>
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="rounded-2xl bg-zinc-950 px-4 py-3 text-sm outline-none"
                  >
                    {brands.map((b) => <option key={b}>{b}</option>)}
                  </select>
                  <button className="rounded-2xl bg-white px-6 py-3 text-sm font-bold text-zinc-950">
                    Search Deals
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur">
              <div className="rounded-[1.5rem] bg-gradient-to-br from-zinc-800 to-zinc-950 p-6">
                <p className="text-sm text-zinc-400">Featured example</p>
                <h2 className="mt-3 text-3xl font-black">2026 BMW i4 eDrive35</h2>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  <Stat label="Monthly" value="$399" />
                  <Stat label="Due at signing" value="$2,500" />
                  <Stat label="Term" value="36 mo" />
                  <Stat label="Mileage" value="10k/yr" />
                </div>
                <button className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 font-bold text-zinc-950">
                  View Deal <ExternalLink size={18} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="deals" className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-500">Marketplace</p>
              <h2 className="mt-2 text-4xl font-black">Featured Lease Deals</h2>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <SlidersHorizontal size={18} className="text-zinc-400" />
              <span className="text-sm text-zinc-300">Max ${maxPayment}/mo</span>
              <input
                type="range"
                min="300"
                max="1000"
                step="50"
                value={maxPayment}
                onChange={(e) => setMaxPayment(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {filteredDeals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        </section>

        <section id="how" className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-7xl gap-5 px-6 py-16 md:grid-cols-3">
            <InfoCard title="Broker permission first" text="Deals are cross-posted only from brokers who approve their listings being featured." />
            <InfoCard title="Standardized deal format" text="Payments, DAS, term, mileage, region, fee, and original source links are organized consistently." />
            <InfoCard title="Easy customer handoff" text="Customers can contact the broker directly so the broker keeps the lead and closes the deal." />
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-10 text-sm text-zinc-500 md:flex-row">
        <p>© 2026 AutoSpace Deals. All rights reserved.</p>
        <p>Built for curated automotive lease discovery.</p>
      </footer>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function DealCard({ deal }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-1 hover:bg-white/[0.07]">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-950">{deal.badge}</span>
        <span className="flex items-center gap-1 text-xs text-zinc-400"><Star size={14} /> {deal.fuel}</span>
      </div>
      <h3 className="text-2xl font-black">{deal.make}</h3>
      <p className="mt-1 text-lg font-semibold text-zinc-200">{deal.model}</p>
      <p className="text-sm text-zinc-500">{deal.trim}</p>

      <div className="mt-6 border-t border-white/10 pt-5">
        <p className="text-sm text-zinc-400">Monthly payment</p>
        <p className="text-4xl font-black">${deal.payment}<span className="text-base font-medium text-zinc-500">/mo</span></p>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-zinc-300">
        <div className="flex items-center justify-between"><span>DAS</span><strong>${deal.das.toLocaleString()}</strong></div>
        <div className="flex items-center justify-between"><span>MSRP</span><strong>${deal.msrp.toLocaleString()}</strong></div>
        <div className="flex items-center justify-between"><span>Term</span><strong>{deal.term} months</strong></div>
        <div className="flex items-center justify-between"><span>Miles</span><strong>{deal.miles.toLocaleString()}/yr</strong></div>
      </div>

      <div className="mt-5 space-y-2 text-sm text-zinc-400">
        <p className="flex items-center gap-2"><MapPin size={16} /> {deal.region}</p>
        <p className="flex items-center gap-2"><Gauge size={16} /> Broker fee: ${deal.fee}</p>
        <p className="flex items-center gap-2"><CalendarDays size={16} /> Broker: {deal.broker}</p>
      </div>

      <button className="mt-6 w-full rounded-2xl bg-white px-4 py-3 font-bold text-zinc-950 transition hover:bg-zinc-200">
        Contact Broker
      </button>
    </article>
  );
}

function InfoCard({ title, text }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 leading-7 text-zinc-400">{text}</p>
    </div>
  );
}
