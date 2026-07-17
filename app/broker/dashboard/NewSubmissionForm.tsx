"use client";

import { useActionState, useState } from "react";
import { Link as LinkIcon, Sheet, FileSpreadsheet, Upload, Car, Link2 } from "lucide-react";
import {
  createSubmissionAction,
  createManualDealAction,
  type SubmissionState,
} from "./actions";

const initialState: SubmissionState = { error: null };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";
const selectClass = inputClass + " appearance-none";

const CATEGORIES = [
  {
    value: "manual",
    label: "Add a car manually",
    description: "Fill in one vehicle's details — publishes right away",
    icon: Car,
  },
  {
    value: "link",
    label: "Link your inventory",
    description: "Forum post, website, Google Sheet, or a file — we'll review it",
    icon: Link2,
  },
] as const;

const LINK_TYPES = [
  { value: "link", label: "Forum post / website", icon: LinkIcon },
  { value: "google_sheet", label: "Google Sheet", icon: Sheet },
  { value: "excel_file", label: "Upload Excel file", icon: FileSpreadsheet },
] as const;

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];

export default function NewSubmissionForm() {
  const [category, setCategory] = useState<"manual" | "link" | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>What are you submitting?</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                category === value
                  ? "border-white bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-zinc-500">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {category === "link" && <LinkForm />}
      {category === "manual" && <ManualForm />}
    </div>
  );
}

function LinkForm() {
  const [state, formAction, pending] = useActionState(createSubmissionAction, initialState);
  const [sourceType, setSourceType] = useState<"link" | "google_sheet" | "excel_file">("link");

  return (
    <form action={formAction} className="space-y-4" key={state.success ? "reset" : "form"}>
      <div>
        <label className={labelClass}>Source type</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {LINK_TYPES.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                sourceType === value
                  ? "border-white bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="sourceType"
                value={value}
                checked={sourceType === value}
                onChange={() => setSourceType(value)}
                className="sr-only"
              />
              <Icon size={15} /> {label}
            </label>
          ))}
        </div>
      </div>

      {sourceType === "excel_file" ? (
        <div>
          <label className={labelClass}>Excel file (.xlsx, .xls, .csv)</label>
          <input
            required
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv"
            className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-zinc-200"
          />
          <p className="mt-1 text-xs text-zinc-600">Max 10MB.</p>
        </div>
      ) : (
        <div>
          <label className={labelClass}>
            {sourceType === "google_sheet"
              ? "Google Sheet share link"
              : "Link to your forum post or website"}
          </label>
          <input
            required
            type="url"
            name="sourceUrl"
            placeholder={
              sourceType === "google_sheet"
                ? "https://docs.google.com/spreadsheets/..."
                : "https://forum.leasehackr.com/t/..."
            }
            className={inputClass}
          />
          {sourceType === "google_sheet" && (
            <p className="mt-1 text-xs text-zinc-600">
              Set sharing to &quot;Anyone with the link can view&quot; so we can read it.
            </p>
          )}
        </div>
      )}

      <div>
        <label className={labelClass}>Notes (optional)</label>
        <textarea
          name="notes"
          placeholder="Anything we should know — which sections to pull, current specials, etc."
          className={`${inputClass} min-h-24 resize-y`}
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Submitted — we&apos;ll review it and you&apos;ll get a chance to confirm which cars go
          live before anything is published.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        <Upload size={16} /> {pending ? "Submitting..." : "Submit for review"}
      </button>
    </form>
  );
}

function ManualForm() {
  const [state, formAction, pending] = useActionState(createManualDealAction, initialState);
  const [dealType, setDealType] = useState<"Lease" | "Finance">("Lease");
  const [onePay, setOnePay] = useState(false);

  return (
    <form action={formAction} className="space-y-4" key={state.success ? "reset" : "form"}>
      <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Vehicle</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <label className={labelClass}>Year</label>
              <input required type="number" name="year" placeholder="2026" className={inputClass} />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Make</label>
              <input required type="text" name="make" placeholder="BMW" className={inputClass} />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Model</label>
              <input required type="text" name="model" placeholder="X5" className={inputClass} />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Trim</label>
              <input required type="text" name="trim" placeholder="xDrive40i" className={inputClass} />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <label className={labelClass}>Body style</label>
              <select required name="bodyStyle" defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Select...
                </option>
                {BODY_STYLES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Fuel type</label>
              <select required name="fuel" defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Select...
                </option>
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Exterior color</label>
              <input required type="text" name="exterior" placeholder="Alpine White" className={inputClass} />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Interior color</label>
              <input required type="text" name="interior" placeholder="Black" className={inputClass} />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Deal terms</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Deal type</label>
              <select
                name="dealType"
                value={dealType}
                onChange={(e) => setDealType(e.target.value as "Lease" | "Finance")}
                className={selectClass}
              >
                <option value="Lease">Lease</option>
                <option value="Finance">Finance</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>MSRP</label>
              <input type="number" name="msrp" placeholder="65000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Selling price</label>
              <input type="number" name="sellingPrice" placeholder="61000" className={inputClass} />
            </div>
          </div>

          {dealType === "Lease" && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
              <input
                type="checkbox"
                name="onePay"
                checked={onePay}
                onChange={(e) => setOnePay(e.target.checked)}
                className="rounded border-white/20 bg-white/5"
              />
              This is a one-pay lease (single upfront lump sum, no monthly bill)
            </label>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>
                {onePay ? "One-pay total" : dealType === "Lease" ? "Monthly payment" : "Est. monthly"}
              </label>
              <input
                required={!onePay}
                disabled={onePay}
                type="number"
                name="payment"
                placeholder={onePay ? "0 — see due at signing" : "799"}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{onePay ? "One-pay amount" : "Due at signing"}</label>
              <input
                required
                type="number"
                name="dueAtSigning"
                placeholder={onePay ? "55999" : "4999"}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Term (months)</label>
              <input required type="number" name="term" placeholder="36" className={inputClass} />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {dealType === "Lease" && (
              <div>
                <label className={labelClass}>Miles per year</label>
                <input type="number" name="milesPerYear" placeholder="10000" className={inputClass} />
              </div>
            )}
            {dealType === "Finance" && (
              <div>
                <label className={labelClass}>APR (%)</label>
                <input type="number" step="0.01" name="apr" placeholder="4.9" className={inputClass} />
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Photos</p>
          <label className={labelClass}>Photo URLs (one per line)</label>
          <textarea
            required
            name="images"
            placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
            className={`${inputClass} min-h-20 resize-y font-mono text-xs`}
          />
          <p className="mt-1 text-xs text-zinc-600">
            Links to real photos of this vehicle — a manufacturer site, your own listing, etc. No
            attachments yet, just links for now.
          </p>
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          name="notes"
          placeholder="Any packages/features, current specials, or anything else worth knowing."
          className={`${inputClass} min-h-24 resize-y`}
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Published — this listing is live on the site now. Manage it below anytime.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        <Upload size={16} /> {pending ? "Publishing..." : "Publish this car"}
      </button>
    </form>
  );
}
