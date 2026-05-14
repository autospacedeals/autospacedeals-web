"use client";
import React, { useMemo, useState } from "react";
import { Search, SlidersHorizontal, MapPin, Gauge, CalendarDays, ExternalLink, Star, Car, ShieldCheck } from "lucide-react";

const deals = [
  {
    id:1,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    msrp: 64000,
    payment: 459,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "Vegas Red",
    interior: "Red",
    broker: "Chrome Stallions",
    brokerFee: 599,
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["Premium", "Parking Assist", "Driving Assistance", "Shadowline"],
  },
  {
      id:2,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    msrp: 65000,
    payment: 469,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "White",
    interior: "Red",
    broker: "Chrome Stallions",
    brokerFee: 599,
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["M-Sport", "Premium", "19\" Wheels", "Extended Shadowline"],
  },
  {
    id: 3,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    msrp: 67000,
    payment: 485,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "White",
    interior: "Black",
    broker: "Chrome Stallions",
    brokerFee: 599,
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["M-Sport", "Shadowline", "Premium", "Parking Assistance"],
  },
  { id: 4,
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    msrp: 67000,
    payment: 489,
    dueAtSigning: 3500,
    term: 36,
    miles: 7500,
    exterior: "Black",
    interior: "Red",
    broker: "Chrome Stallions",
    brokerFee: 599,
    notes: "Loyalty required. Based on 7.75% base rate.",
    packages: ["M-Package", "Shadowline", "Premium"],
  },
];

const brands = ["All", ...Array.from(new Set(deals.map((deal) => deal.make)))];

export default function AutoSpaceDealsMVP() {
  const [brand, setBrand] = useState("All");
  const [maxPayment, setMaxPayment] = useState(1000);
  const [query, setQuery] = useState("");
const [selectedDeal, setSelectedDeal] = useState<any | null>(null);
  const filteredDeals = useMemo(() => {
    const search = query.trim().toLowerCase();

    return deals.filter((deal) => {
      const matchesBrand = brand === "All" || deal.make === brand;
      const matchesPayment = deal.payment <= maxPayment;

      const searchableText = [
        deal.make,
        deal.model,
        deal.exterior,
        deal.interior,
        deal.broker,
        deal.notes,
        ...(deal.packages || []),
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = search === "" || searchableText.includes(search);

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
            <a href="/leasing-guide" className="text-sm text-zinc-300 hover:text-white">
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
<DealCard
  key={deal.id}
  deal={deal}
  onSelect={setSelectedDeal}
/>            ))}
          </div>
        </section>

        <section id="how" className="border-y border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-7xl gap-5 px-6 py-16 md:grid-cols-3">
            <InfoCard title="Broker permission first" text="Deals are cross-posted only from brokers who approve their listings being featured." />
            <InfoCard title="Standardized deal format" text="Payments, DAS, term, mileage, region, fee, and original source links are organized consistently." />
            <InfoCard title="Easy customer handoff" text="Customers can contact the broker directly so the broker keeps the lead and closes the deal." />
          </div>
        </section>
        {selectedDeal && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
    onClick={() => setSelectedDeal(null)}
  >
    <div
      className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-zinc-400">
            {selectedDeal.make}
          </p>

          <h2 className="text-3xl font-black">
            {selectedDeal.model}
          </h2>

          <p className="mt-1 text-zinc-400">
            {selectedDeal.region}
          </p>
        </div>

        <button
          onClick={() => setSelectedDeal(null)}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs text-zinc-500">Monthly</p>
          <p className="mt-1 text-2xl font-black">
            ${selectedDeal.payment}/mo
          </p>
        </div>

        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs text-zinc-500">Due at Signing</p>
          <p className="mt-1 text-2xl font-black">
            ${selectedDeal.dueAtSigning}
          </p>
        </div>

        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs text-zinc-500">Term</p>
          <p className="mt-1 text-2xl font-black">
            {selectedDeal.term} mo
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 p-5">
        <h3 className="text-lg font-bold">
          Deal Details
        </h3>

        <div className="mt-4 space-y-2 text-zinc-300">
          <p>Region: {selectedDeal.region}</p>
          <p>Exterior: {selectedDeal.exterior}</p>
          <p>Interior: {selectedDeal.interior}</p>
          <p>Broker: {selectedDeal.broker}</p>
          <p>Broker Fee: ${selectedDeal.fee}</p>
          <p>Mileage: {selectedDeal.miles}/yr</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 p-5">
        <h3 className="text-lg font-bold">
          Incentives & Packages
        </h3>

        <div className="mt-4 flex flex-wrap gap-2">
          {selectedDeal.packages?.map((item: string) => (
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
        <h3 className="text-lg font-bold">
          Notes
        </h3>

        <p className="mt-3 leading-7 text-zinc-300">
          {selectedDeal.notes}
        </p>
      </div>
    </div>
  </div>
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
  return (
<article
  onClick={() => onSelect(deal)}
  className="cursor-pointer rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition hover:-translate-y-1 hover:bg-white/[0.08]"
>      <div className="mb-4 flex items-center justify-between">
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
        <div className="flex items-center justify-between"><span>DAS</span><strong>${deal.dueAtSigning.toLocaleString()}</strong></div>
        <div className="flex items-center justify-between"><span>MSRP</span><strong>${deal.msrp.toLocaleString()}</strong></div>
        <div className="flex items-center justify-between"><span>Term</span><strong>{deal.term} months</strong></div>
        <div className="flex items-center justify-between"><span>Miles</span><strong>{deal.miles.toLocaleString()}/yr</strong></div>
      </div>

      <div className="mt-5 space-y-2 text-sm text-zinc-400">
        <p className="flex items-center gap-2"><MapPin size={16} /> {deal.region}</p>
        <p className="flex items-center gap-2"><Gauge size={16} /> Broker fee: ${deal.fee}</p>
        <p className="flex items-center gap-2"><CalendarDays size={16} /> Broker: {deal.broker}</p>
      </div>

<div className="mt-6 rounded-2xl bg-white p-1">
  <details className="group">
    <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-center font-bold text-zinc-950 transition hover:bg-zinc-200">
      Contact Broker
    </summary>

    <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-zinc-950">
      <p className="text-sm font-bold">Contact Broker</p>
      <p className="mt-1 text-sm text-zinc-600">Choose how you want to reach us.</p>

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

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-3 leading-7 text-zinc-400">{text}</p>
    </div>
  );
}
