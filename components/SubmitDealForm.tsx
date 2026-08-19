"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { BODY_STYLES, FUEL_TYPES } from "@/lib/deals-data";

const SUBMISSION_EMAIL = "rob@idriveus.com";

type FormState = {
  sellerType: "Dealer" | "Broker";
  sellerName: string;
  sellerPhone: string;
  sellerEmail: string;
  city: string;
  state: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyStyle: string;
  fuel: string;
  dealType: "Lease" | "Finance";
  msrp: string;
  sellingPrice: string;
  payment: string;
  dueAtSigning: string;
  term: string;
  milesPerYear: string;
  apr: string;
  sourceUrl: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  sellerType: "Broker",
  sellerName: "",
  sellerPhone: "",
  sellerEmail: "",
  city: "",
  state: "",
  year: "",
  make: "",
  model: "",
  trim: "",
  bodyStyle: "SUV",
  fuel: "Gas",
  dealType: "Lease",
  msrp: "",
  sellingPrice: "",
  payment: "",
  dueAtSigning: "",
  term: "",
  milesPerYear: "",
  apr: "",
  sourceUrl: "",
  notes: "",
};

function buildMailto(form: FormState): string {
  const subject = encodeURIComponent(
    `New deal submission: ${form.year} ${form.make} ${form.model}`.trim()
  );

  const lines = [
    `Seller type: ${form.sellerType}`,
    `Seller / business name: ${form.sellerName}`,
    `Contact phone: ${form.sellerPhone}`,
    `Contact email: ${form.sellerEmail}`,
    `Location: ${form.city}, ${form.state}`,
    "",
    `Vehicle: ${form.year} ${form.make} ${form.model} ${form.trim}`.trim(),
    `Body style: ${form.bodyStyle}`,
    `Fuel type: ${form.fuel}`,
    `Deal type: ${form.dealType}`,
    "",
    `MSRP: ${form.msrp}`,
    `Selling price: ${form.sellingPrice}`,
    `Monthly payment: ${form.payment}`,
    `Due at signing: ${form.dueAtSigning}`,
    `Term (months): ${form.term}`,
    form.dealType === "Lease" ? `Miles per year: ${form.milesPerYear}` : `APR: ${form.apr}`,
    "",
    form.sourceUrl ? `Source / posting link: ${form.sourceUrl}` : "",
    "",
    "Notes / conditions (loyalty, conquest, fees, incentives, etc.):",
    form.notes,
    "",
    "---",
    "Photos: please attach a few real photos of this vehicle to this email before sending.",
  ];

  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${SUBMISSION_EMAIL}?subject=${subject}&body=${body}`;
}

export default function SubmitDealForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = buildMailto(form);
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
  const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-8">
      <section>
        <h2 className="mb-4 text-lg font-bold">Your info</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>I am a</label>
            <select
              className={inputClass}
              value={form.sellerType}
              onChange={(e) => update("sellerType", e.target.value as FormState["sellerType"])}
            >
              <option value="Broker">Broker</option>
              <option value="Dealer">Dealer</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Business name</label>
            <input
              required
              className={inputClass}
              placeholder="e.g. Chrome Stallions"
              value={form.sellerName}
              onChange={(e) => update("sellerName", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Contact phone</label>
            <input
              required
              className={inputClass}
              placeholder="949-555-1234"
              value={form.sellerPhone}
              onChange={(e) => update("sellerPhone", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Contact email</label>
            <input
              required
              type="email"
              className={inputClass}
              placeholder="you@business.com"
              value={form.sellerEmail}
              onChange={(e) => update("sellerEmail", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input
              required
              className={inputClass}
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>State</label>
            <input
              required
              maxLength={2}
              className={inputClass}
              placeholder="CA"
              value={form.state}
              onChange={(e) => update("state", e.target.value.toUpperCase())}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Vehicle</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Year</label>
            <input
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="2026"
              value={form.year}
              onChange={(e) => update("year", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Make</label>
            <input
              required
              className={inputClass}
              placeholder="BMW"
              value={form.make}
              onChange={(e) => update("make", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input
              required
              className={inputClass}
              placeholder="X5"
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Trim</label>
            <input
              className={inputClass}
              placeholder="xDrive40i"
              value={form.trim}
              onChange={(e) => update("trim", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Body style</label>
            <select
              className={inputClass}
              value={form.bodyStyle}
              onChange={(e) => update("bodyStyle", e.target.value)}
            >
              {BODY_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Fuel type</label>
            <select
              className={inputClass}
              value={form.fuel}
              onChange={(e) => update("fuel", e.target.value)}
            >
              {FUEL_TYPES.map((fuel) => (
                <option key={fuel} value={fuel}>
                  {fuel}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Deal terms</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Deal type</label>
            <select
              className={inputClass}
              value={form.dealType}
              onChange={(e) => update("dealType", e.target.value as FormState["dealType"])}
            >
              <option value="Lease">Lease</option>
              <option value="Finance">Finance</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Term (months)</label>
            <input
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="36"
              value={form.term}
              onChange={(e) => update("term", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>MSRP</label>
            <input
              inputMode="numeric"
              className={inputClass}
              placeholder="55000"
              value={form.msrp}
              onChange={(e) => update("msrp", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Selling price</label>
            <input
              inputMode="numeric"
              className={inputClass}
              placeholder="52000"
              value={form.sellingPrice}
              onChange={(e) => update("sellingPrice", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Monthly payment</label>
            <input
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="499"
              value={form.payment}
              onChange={(e) => update("payment", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Due at signing</label>
            <input
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="3500"
              value={form.dueAtSigning}
              onChange={(e) => update("dueAtSigning", e.target.value)}
            />
          </div>
          {form.dealType === "Lease" ? (
            <div>
              <label className={labelClass}>Miles per year</label>
              <input
                inputMode="numeric"
                className={inputClass}
                placeholder="10000"
                value={form.milesPerYear}
                onChange={(e) => update("milesPerYear", e.target.value)}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass}>APR (%)</label>
              <input
                inputMode="decimal"
                className={inputClass}
                placeholder="4.9"
                value={form.apr}
                onChange={(e) => update("apr", e.target.value)}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>Source / posting link (optional)</label>
            <input
              className={inputClass}
              placeholder="Leasehackr thread, etc."
              value={form.sourceUrl}
              onChange={(e) => update("sourceUrl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold">Notes &amp; conditions</h2>
        <textarea
          className={`${inputClass} min-h-32 resize-y`}
          placeholder="Loyalty/conquest requirements, broker fees included, incentives applied, tax status, etc."
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </section>

      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 sm:w-auto"
      >
        <Mail size={16} /> Send Submission
      </button>
      <p className="text-xs text-zinc-600">
        This opens your email app with everything filled in — nothing is sent until you hit send
        there. Please attach a few real photos before sending.
      </p>
    </form>
  );
}
