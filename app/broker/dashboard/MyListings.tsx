"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency } from "@/lib/deal-utils";
import { PLACEHOLDER_IMAGE } from "@/lib/supabase/deals";
import { updateDealAction, deleteDealAction } from "./actions";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-zinc-400";
const selectClass = inputClass + " appearance-none";
const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];
const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];

export default function MyListings({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-500">
        You don&apos;t have any live listings yet — use the form above to add one.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deals.map((deal) => (
        <ListingRow key={deal.id} deal={deal} />
      ))}
    </div>
  );
}

function ListingRow({ deal }: { deal: Deal }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dealType, setDealType] = useState<"Lease" | "Finance">(deal.dealType);
  const [onePay, setOnePay] = useState(deal.onePay);
  const [incentives, setIncentives] = useState<IncentiveRow[]>(deal.incentives ?? []);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div>
          <p className="font-bold">{dealTitle(deal)}</p>
          <p className="text-sm text-zinc-500">
            {deal.onePay ? `${formatCurrency(deal.dueAtSigning)} one-pay` : `${formatCurrency(deal.payment)}/mo`}
            {" · "}
            {formatCurrency(deal.dueAtSigning)} due at signing
            {!deal.inStock && <span className="ml-2 text-amber-400">Out of stock</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/20 bg-white/[0.05] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="font-bold">{dealTitle(deal)}</p>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-zinc-500 hover:text-white"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>

      <form
        action={async (formData) => {
          setError(null);
          const result = await updateDealAction(formData);
          if (result.error) setError(result.error);
          else setEditing(false);
        }}
        className="mt-3 space-y-3"
      >
        <input type="hidden" name="id" value={deal.id} />

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Year</label>
            <input required type="number" name="year" defaultValue={deal.year} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Make</label>
            <input required type="text" name="make" defaultValue={deal.make} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input required type="text" name="model" defaultValue={deal.model} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Trim (optional)</label>
            <input type="text" name="trim" defaultValue={deal.trim} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={labelClass}>Condition</label>
            <select name="condition" defaultValue={deal.condition ?? "New"} className={selectClass}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Body style (optional)</label>
            <select name="bodyStyle" defaultValue={deal.bodyStyle ?? ""} className={selectClass}>
              <option value="">Not specified</option>
              {BODY_STYLES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Fuel type (optional)</label>
            <select name="fuel" defaultValue={deal.fuel ?? ""} className={selectClass}>
              <option value="">Not specified</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Exterior color (optional)</label>
            <input type="text" name="exterior" defaultValue={deal.exterior} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Interior color (optional)</label>
            <input type="text" name="interior" defaultValue={deal.interior} className={inputClass} />
          </div>
        </div>

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
            <input required type="number" name="msrp" defaultValue={deal.msrp || ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Selling price (optional)</label>
            <input type="number" name="sellingPrice" defaultValue={deal.sellingPrice ?? ""} className={inputClass} />
          </div>
        </div>

        {dealType === "Lease" && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              name="onePay"
              checked={onePay}
              onChange={(e) => setOnePay(e.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            One-pay lease (single upfront lump sum, no monthly bill)
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>
              {onePay ? "One-pay total" : dealType === "Lease" ? "Monthly payment" : "Est. monthly"}
            </label>
            <input
              required={!onePay}
              disabled={onePay}
              type="number"
              name="payment"
              defaultValue={deal.payment || ""}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{onePay ? "One-pay amount" : "Due at signing"}</label>
            <input required type="number" name="dueAtSigning" defaultValue={deal.dueAtSigning} className={inputClass} />
            <input
              type="number"
              step="0.01"
              name="dueAtSigningTaxRate"
              defaultValue={deal.dueAtSigningTaxRate ?? ""}
              placeholder="Assumed tax % (optional)"
              className={`${inputClass} mt-1.5 text-xs`}
            />
          </div>
          <div>
            <label className={labelClass}>Term (months)</label>
            <input required type="number" name="term" defaultValue={deal.term} className={inputClass} />
          </div>
        </div>

        {dealType === "Lease" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Miles per year</label>
              <input
                required
                type="number"
                name="milesPerYear"
                defaultValue={deal.milesPerYear ?? ""}
                className={inputClass}
              />
            </div>
          </div>
        )}
        {dealType === "Finance" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>APR (%, optional)</label>
              <input type="number" step="0.01" name="apr" defaultValue={deal.apr ?? ""} className={inputClass} />
            </div>
          </div>
        )}

        <IncentivesEditor value={incentives} onChange={setIncentives} />

        <div>
          <label className={labelClass}>Photo URLs (one per line, optional)</label>
          <textarea
            name="images"
            defaultValue={deal.images.filter((i) => i !== PLACEHOLDER_IMAGE).join("\n")}
            placeholder="https://example.com/photo1.jpg"
            className={`${inputClass} min-h-16 resize-y font-mono text-xs`}
          />
          <p className="mt-1 text-xs text-zinc-600">
            Leave blank and we&apos;ll try to automatically find a matching stock photo, but we
            can&apos;t guarantee it&apos;ll be the exact year/trim/color.
          </p>
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            name="notes"
            defaultValue={deal.notes}
            className={`${inputClass} min-h-20 resize-y`}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            name="inStock"
            defaultChecked={deal.inStock}
            className="rounded border-white/20 bg-white/5"
          />
          In stock / available
        </label>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
          >
            Save changes
          </button>
          <span className="text-xs text-zinc-600">Goes live immediately</span>
        </div>
      </form>

      <form
        action={async (formData) => {
          if (typeof window !== "undefined" && !window.confirm("Remove this listing? This can't be undone.")) {
            return;
          }
          await deleteDealAction(formData);
        }}
        className="mt-3 border-t border-white/10 pt-3"
      >
        <input type="hidden" name="id" value={deal.id} />
        <button
          type="submit"
          className="flex items-center gap-1.5 text-sm font-semibold text-red-400 transition hover:text-red-300"
        >
          <Trash2 size={14} /> Remove listing
        </button>
      </form>
    </div>
  );
}
