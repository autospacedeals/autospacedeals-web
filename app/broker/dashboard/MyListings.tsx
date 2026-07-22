"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency } from "@/lib/deal-utils";
import { updateDealAction, deleteDealAction } from "./actions";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const selectClass = inputClass + " appearance-none";
const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];

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
          await updateDealAction(formData);
          setEditing(false);
        }}
        className="mt-3 space-y-3"
      >
        <input type="hidden" name="id" value={deal.id} />
        {/* Not user-editable here (vehicle identity is fixed once published) —
            just lets IncentivesEditor's "Suggest with AI" button read them. */}
        <input type="hidden" name="year" value={deal.year} />
        <input type="hidden" name="make" value={deal.make} />
        <input type="hidden" name="model" value={deal.model} />
        <input type="hidden" name="trim" value={deal.trim} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">
              {deal.onePay ? "One-pay amount" : "Monthly payment"}
            </label>
            <input
              type="number"
              name="payment"
              defaultValue={deal.payment}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Due at signing</label>
            <input
              type="number"
              name="dueAtSigning"
              defaultValue={deal.dueAtSigning}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Condition</label>
            <select name="condition" defaultValue={deal.condition ?? "New"} className={selectClass}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-zinc-400">Notes</label>
          <textarea
            name="notes"
            defaultValue={deal.notes}
            className={`${inputClass} min-h-20 resize-y`}
          />
        </div>

        <IncentivesEditor value={incentives} onChange={setIncentives} />

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            name="inStock"
            defaultChecked={deal.inStock}
            className="rounded border-white/20 bg-white/5"
          />
          In stock / available
        </label>

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
