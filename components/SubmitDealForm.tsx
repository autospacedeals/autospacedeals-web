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
  msrp: string;
  sellingPrice: string;
  payment: string;
  dueAtSigning: string;
  term: string;
  milesPerYear: string;
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
  msrp: "",
  sellingPrice: "",
  payment: "",
  dueAtSigning: "",
  term: "",
  milesPerYear: "",
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
    "",
    `MSRP: ${form.msrp}`,
    `Selling price: ${form.sellingPrice}`,
    `Monthly payment: ${form.payment}`,
    `Due at signing: ${form.dueAtSigning}`,
    `Term (months): ${form.term}`,
    `Miles per year: ${form.milesPerYear}`,
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

  const inputClass = "input";
  const selectClass = "select";
  const labelClass = "field-label";

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <section className="panel">
        <h2 className="type-title mb-5">Your info</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="submit-seller-type" className={labelClass}>I am a</label>
            <select
              id="submit-seller-type"
              className={selectClass}
              value={form.sellerType}
              onChange={(e) => update("sellerType", e.target.value as FormState["sellerType"])}
            >
              <option value="Broker">Broker</option>
              <option value="Dealer">Dealer</option>
            </select>
          </div>
          <div>
            <label htmlFor="submit-seller-name" className={labelClass}>Business name</label>
            <input
              id="submit-seller-name"
              required
              className={inputClass}
              placeholder="e.g. Chrome Stallions"
              value={form.sellerName}
              onChange={(e) => update("sellerName", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-seller-phone" className={labelClass}>Contact phone</label>
            <input
              id="submit-seller-phone"
              required
              className={inputClass}
              placeholder="949-555-1234"
              value={form.sellerPhone}
              onChange={(e) => update("sellerPhone", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-seller-email" className={labelClass}>Contact email</label>
            <input
              id="submit-seller-email"
              required
              type="email"
              className={inputClass}
              placeholder="you@business.com"
              value={form.sellerEmail}
              onChange={(e) => update("sellerEmail", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-city" className={labelClass}>City</label>
            <input
              id="submit-city"
              required
              className={inputClass}
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-state" className={labelClass}>State</label>
            <input
              id="submit-state"
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

      <section className="panel">
        <h2 className="type-title mb-5">Vehicle</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="submit-year" className={labelClass}>Year</label>
            <input
              id="submit-year"
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="2026"
              value={form.year}
              onChange={(e) => update("year", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-make" className={labelClass}>Make</label>
            <input
              id="submit-make"
              required
              className={inputClass}
              placeholder="BMW"
              value={form.make}
              onChange={(e) => update("make", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-model" className={labelClass}>Model</label>
            <input
              id="submit-model"
              required
              className={inputClass}
              placeholder="X5"
              value={form.model}
              onChange={(e) => update("model", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-trim" className={labelClass}>Trim</label>
            <input
              id="submit-trim"
              className={inputClass}
              placeholder="xDrive40i"
              value={form.trim}
              onChange={(e) => update("trim", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-body-style" className={labelClass}>Body style</label>
            <select
              id="submit-body-style"
              className={selectClass}
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
            <label htmlFor="submit-fuel" className={labelClass}>Fuel type</label>
            <select
              id="submit-fuel"
              className={selectClass}
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

      <section className="panel">
        <h2 className="type-title mb-5">Deal terms</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="submit-term" className={labelClass}>Term (months)</label>
            <input
              id="submit-term"
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="36"
              value={form.term}
              onChange={(e) => update("term", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-msrp" className={labelClass}>MSRP</label>
            <input
              id="submit-msrp"
              inputMode="numeric"
              className={inputClass}
              placeholder="55000"
              value={form.msrp}
              onChange={(e) => update("msrp", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-selling-price" className={labelClass}>Selling price</label>
            <input
              id="submit-selling-price"
              inputMode="numeric"
              className={inputClass}
              placeholder="52000"
              value={form.sellingPrice}
              onChange={(e) => update("sellingPrice", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-payment" className={labelClass}>Monthly payment</label>
            <input
              id="submit-payment"
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="499"
              value={form.payment}
              onChange={(e) => update("payment", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-due-at-signing" className={labelClass}>Due at signing</label>
            <input
              id="submit-due-at-signing"
              required
              inputMode="numeric"
              className={inputClass}
              placeholder="3500"
              value={form.dueAtSigning}
              onChange={(e) => update("dueAtSigning", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-miles-per-year" className={labelClass}>Miles per year</label>
            <input
              id="submit-miles-per-year"
              inputMode="numeric"
              className={inputClass}
              placeholder="10000"
              value={form.milesPerYear}
              onChange={(e) => update("milesPerYear", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="submit-source-url" className={labelClass}>Source / posting link (optional)</label>
            <input
              id="submit-source-url"
              className={inputClass}
              placeholder="Leasehackr thread, etc."
              value={form.sourceUrl}
              onChange={(e) => update("sourceUrl", e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 id="submit-notes-heading" className="type-title mb-5">Notes &amp; conditions</h2>
        <textarea
          aria-labelledby="submit-notes-heading"
          className="textarea min-h-32 resize-y"
          placeholder="Loyalty/conquest requirements, broker fees included, incentives applied, tax status, etc."
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </section>

      <button type="submit" className="btn btn-primary btn-lg w-full sm:w-auto">
        <Mail /> Send submission
      </button>
      <p className="text-xs leading-5 text-fg-muted">
        This opens your email app with everything filled in — nothing is sent until you hit send
        there. Please attach a few real photos before sending.
      </p>
    </form>
  );
}
