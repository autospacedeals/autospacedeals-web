"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { PLACEHOLDER_IMAGE } from "@/lib/supabase/deals";
import { updateDealAction, deleteDealAction, deleteDealsAction } from "./actions";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";

const cellInputClass =
  "w-full min-w-0 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const cellSelectClass = cellInputClass + " appearance-none";
const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-zinc-400";
const selectClass = inputClass + " appearance-none";

const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];
const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];

const th = "px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500 whitespace-nowrap";
const td = "px-2.5 py-2 align-middle whitespace-nowrap";

interface RowDraft {
  year: string;
  make: string;
  model: string;
  trim: string;
  bodyStyle: string;
  fuel: string;
  exterior: string;
  interior: string;
  dealType: "Lease" | "Finance";
  onePay: boolean;
  payment: string;
  dueAtSigning: string;
  dueAtSigningTaxRate: string;
  term: string;
  milesPerYear: string;
  apr: string;
  msrp: string;
  sellingPrice: string;
  inStock: boolean;
  notes: string;
  condition: string;
  images: string;
  incentives: IncentiveRow[];
}

function deriveDraft(deal: Deal): RowDraft {
  return {
    year: String(deal.year ?? ""),
    make: deal.make ?? "",
    model: deal.model ?? "",
    trim: deal.trim ?? "",
    bodyStyle: deal.bodyStyle ?? "",
    fuel: deal.fuel ?? "",
    exterior: deal.exterior ?? "",
    interior: deal.interior ?? "",
    dealType: deal.dealType,
    onePay: deal.onePay ?? false,
    payment: deal.onePay ? "" : String(deal.payment || ""),
    dueAtSigning: String(deal.dueAtSigning ?? ""),
    dueAtSigningTaxRate: deal.dueAtSigningTaxRate != null ? String(deal.dueAtSigningTaxRate) : "",
    term: String(deal.term ?? ""),
    milesPerYear: deal.milesPerYear != null ? String(deal.milesPerYear) : "",
    apr: deal.apr != null ? String(deal.apr) : "",
    msrp: String(deal.msrp ?? ""),
    sellingPrice: deal.sellingPrice != null ? String(deal.sellingPrice) : "",
    inStock: deal.inStock,
    notes: deal.notes ?? "",
    condition: deal.condition ?? "New",
    images: (deal.images ?? []).filter((i) => i !== PLACEHOLDER_IMAGE).join("\n"),
    incentives: deal.incentives ?? [],
  };
}

export default function MyListings({ deals }: { deals: Deal[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  if (deals.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-500">
        You don&apos;t have any live listings yet — use the form above to add one.
      </div>
    );
  }

  const allSelected = selected.size > 0 && deals.every((d) => selected.has(d.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(deals.map((d) => d.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${selected.size} listing${selected.size === 1 ? "" : "s"}? This can't be undone.`
      )
    ) {
      return;
    }
    setBulkError(null);
    setBulkDeleting(true);
    try {
      const result = await deleteDealsAction(Array.from(selected));
      if (result.error) setBulkError(result.error);
      else setSelected(new Set());
    } catch {
      setBulkError("Couldn't delete those listings — try again.");
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          Edit cells inline and hit save on a row, or select rows to bulk delete. Scroll right for
          more fields, and expand a row (chevron) for the rest.
        </p>
        <div className="flex items-center gap-2">
          {bulkError && <p className="text-xs text-red-400">{bulkError}</p>}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={selected.size === 0 || bulkDeleting}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete selected {selected.size > 0 && `(${selected.size})`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04]">
              <th className={th}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-white/20 bg-white/5"
                  aria-label="Select all listings"
                />
              </th>
              <th className={th}></th>
              <th className={th}>Year</th>
              <th className={th}>Make</th>
              <th className={th}>Model</th>
              <th className={th}>Trim</th>
              <th className={th}>Condition</th>
              <th className={th}>Deal type</th>
              <th className={th}>MSRP</th>
              <th className={th}>Payment</th>
              <th className={th}>Due at signing</th>
              <th className={th}>Tax %</th>
              <th className={th}>Term</th>
              <th className={th}>Mi/yr</th>
              <th className={th}>1-pay</th>
              <th className={th}>In stock</th>
              <th className={th}></th>
              <th className={th}></th>
              <th className={th}></th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <ListingRow
                key={deal.id}
                deal={deal}
                selected={selected.has(deal.id)}
                onToggleSelect={() => toggleOne(deal.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListingRow({
  deal,
  selected,
  onToggleSelect,
}: {
  deal: Deal;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const baseline = useMemo(() => deriveDraft(deal), [deal]);
  const [draft, setDraft] = useState<RowDraft>(baseline);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  function set<K extends keyof RowDraft>(key: K, value: RowDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("id", deal.id);
      fd.set("year", draft.year);
      fd.set("make", draft.make);
      fd.set("model", draft.model);
      fd.set("trim", draft.trim);
      fd.set("bodyStyle", draft.bodyStyle);
      fd.set("fuel", draft.fuel);
      fd.set("exterior", draft.exterior);
      fd.set("interior", draft.interior);
      fd.set("dealType", draft.dealType);
      if (draft.onePay) fd.set("onePay", "on");
      fd.set("payment", draft.payment);
      fd.set("dueAtSigning", draft.dueAtSigning);
      if (draft.dueAtSigningTaxRate) fd.set("dueAtSigningTaxRate", draft.dueAtSigningTaxRate);
      fd.set("term", draft.term);
      if (draft.milesPerYear) fd.set("milesPerYear", draft.milesPerYear);
      if (draft.apr) fd.set("apr", draft.apr);
      fd.set("msrp", draft.msrp);
      if (draft.sellingPrice) fd.set("sellingPrice", draft.sellingPrice);
      if (draft.inStock) fd.set("inStock", "on");
      fd.set("notes", draft.notes);
      fd.set("condition", draft.condition);
      fd.set(
        "incentives",
        JSON.stringify(draft.incentives.filter((r) => r.name.trim() && r.amount > 0))
      );
      fd.set("images", draft.images);

      const result = await updateDealAction(fd);
      if (result.error) setError(result.error);
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove this listing? This can't be undone.")
    ) {
      return;
    }
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.set("id", deal.id);
      const result = await deleteDealAction(fd);
      if (result?.error) setError(result.error);
    } catch {
      setError("Couldn't delete — try again.");
    } finally {
      setDeleting(false);
    }
  }

  const image = deal.images[0];

  return (
    <>
      <tr className={`border-b border-white/5 ${dirty ? "bg-amber-500/[0.04]" : ""}`}>
        <td className={td}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="rounded border-white/20 bg-white/5"
            aria-label={`Select ${draft.year} ${draft.make} ${draft.model}`}
          />
        </td>
        <td className={td}>
          <img src={image} alt="" className="h-9 w-12 rounded-md object-cover" />
        </td>
        <td className={td}>
          <input
            type="number"
            value={draft.year}
            onChange={(e) => set("year", e.target.value)}
            className={`${cellInputClass} w-16`}
          />
        </td>
        <td className={td}>
          <input
            type="text"
            value={draft.make}
            onChange={(e) => set("make", e.target.value)}
            className={`${cellInputClass} w-24`}
          />
        </td>
        <td className={td}>
          <input
            type="text"
            value={draft.model}
            onChange={(e) => set("model", e.target.value)}
            className={`${cellInputClass} w-28`}
          />
        </td>
        <td className={td}>
          <input
            type="text"
            value={draft.trim}
            onChange={(e) => set("trim", e.target.value)}
            className={`${cellInputClass} w-24`}
          />
        </td>
        <td className={td}>
          <select
            value={draft.condition}
            onChange={(e) => set("condition", e.target.value)}
            className={`${cellSelectClass} w-24`}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </td>
        <td className={td}>
          <select
            value={draft.dealType}
            onChange={(e) => set("dealType", e.target.value as "Lease" | "Finance")}
            className={`${cellSelectClass} w-24`}
          >
            <option value="Lease">Lease</option>
            <option value="Finance">Finance</option>
          </select>
        </td>
        <td className={td}>
          <input
            type="number"
            value={draft.msrp}
            onChange={(e) => set("msrp", e.target.value)}
            className={`${cellInputClass} w-24`}
          />
        </td>
        <td className={td}>
          <input
            type="number"
            disabled={draft.onePay}
            value={draft.payment}
            onChange={(e) => set("payment", e.target.value)}
            className={`${cellInputClass} w-24 disabled:opacity-40`}
          />
        </td>
        <td className={td}>
          <input
            type="number"
            value={draft.dueAtSigning}
            onChange={(e) => set("dueAtSigning", e.target.value)}
            className={`${cellInputClass} w-24`}
          />
        </td>
        <td className={td}>
          <input
            type="number"
            step="0.01"
            value={draft.dueAtSigningTaxRate}
            onChange={(e) => set("dueAtSigningTaxRate", e.target.value)}
            placeholder="—"
            className={`${cellInputClass} w-16`}
          />
        </td>
        <td className={td}>
          <input
            type="number"
            value={draft.term}
            onChange={(e) => set("term", e.target.value)}
            className={`${cellInputClass} w-16`}
          />
        </td>
        <td className={td}>
          {draft.dealType === "Lease" ? (
            <input
              type="number"
              value={draft.milesPerYear}
              onChange={(e) => set("milesPerYear", e.target.value)}
              className={`${cellInputClass} w-20`}
            />
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </td>
        <td className={td}>
          {draft.dealType === "Lease" ? (
            <input
              type="checkbox"
              checked={draft.onePay}
              onChange={(e) => set("onePay", e.target.checked)}
              className="rounded border-white/20 bg-white/5"
              aria-label="One-pay lease"
            />
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </td>
        <td className={td}>
          <input
            type="checkbox"
            checked={draft.inStock}
            onChange={(e) => set("inStock", e.target.checked)}
            className="rounded border-white/20 bg-white/5"
            aria-label="In stock"
          />
        </td>
        <td className={td}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-default disabled:bg-white/10 disabled:text-zinc-600"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </td>
        <td className={td}>
          <Link
            href={`/deals/${deal.slug}`}
            target="_blank"
            className="flex items-center gap-1 text-xs font-semibold text-zinc-300 hover:text-white hover:underline"
          >
            See card <ExternalLink size={11} />
          </Link>
        </td>
        <td className={td}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            More
          </button>
        </td>
        <td className={td}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-400 transition hover:text-red-300 disabled:opacity-50"
            aria-label="Delete listing"
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </td>
      </tr>

      {error && (
        <tr className="border-b border-white/5">
          <td colSpan={20} className="px-2.5 py-2">
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          </td>
        </tr>
      )}

      {expanded && (
        <tr className="border-b border-white/5 bg-white/[0.02]">
          <td colSpan={20} className="p-4 sm:p-5">
            {/* Local <form> is not submitted directly — it just gives
                IncentivesEditor's "Suggest with AI" button a form context to
                read year/make/model/trim from, matching how it's used in the
                other broker forms. */}
            <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
              <input type="hidden" name="year" value={draft.year} readOnly />
              <input type="hidden" name="make" value={draft.make} readOnly />
              <input type="hidden" name="model" value={draft.model} readOnly />
              <input type="hidden" name="trim" value={draft.trim} readOnly />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={labelClass}>Body style</label>
                  <select
                    value={draft.bodyStyle}
                    onChange={(e) => set("bodyStyle", e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Not specified</option>
                    {BODY_STYLES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Fuel type</label>
                  <select
                    value={draft.fuel}
                    onChange={(e) => set("fuel", e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Not specified</option>
                    {FUEL_TYPES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Exterior color</label>
                  <input
                    type="text"
                    value={draft.exterior}
                    onChange={(e) => set("exterior", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Interior color</label>
                  <input
                    type="text"
                    value={draft.interior}
                    onChange={(e) => set("interior", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Selling price (optional)</label>
                  <input
                    type="number"
                    value={draft.sellingPrice}
                    onChange={(e) => set("sellingPrice", e.target.value)}
                    className={inputClass}
                  />
                </div>
                {draft.dealType === "Finance" && (
                  <div>
                    <label className={labelClass}>APR (%, optional)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={draft.apr}
                      onChange={(e) => set("apr", e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}
              </div>

              <IncentivesEditor
                value={draft.incentives}
                onChange={(rows) => set("incentives", rows)}
              />

              <div>
                <label className={labelClass}>Photo URLs (one per line, optional)</label>
                <textarea
                  value={draft.images}
                  onChange={(e) => set("images", e.target.value)}
                  placeholder="https://example.com/photo1.jpg"
                  className={`${inputClass} min-h-16 resize-y font-mono text-xs`}
                />
              </div>

              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className={`${inputClass} min-h-20 resize-y`}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-default disabled:bg-white/10 disabled:text-zinc-600"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save changes
                </button>
                <span className="text-xs text-zinc-600">Goes live immediately</span>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
