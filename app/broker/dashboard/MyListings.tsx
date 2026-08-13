"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

// Borderless-until-touched inputs — the point is to read like an editable
// list, not a literal spreadsheet grid of boxes. A cell only "lights up"
// on hover/focus so the row stays visually calm until you interact with it.
// Also strips the native up/down spinner arrows browsers add to
// type="number" inputs, and forces a hard line-break ("block") so a
// secondary sub-field (like the tax-rate hint under Payment) always stacks
// under the main value instead of sitting inline and overflowing into the
// next column when the column is narrow.
const noSpinner =
  "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const cellInputClass =
  `block w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 transition hover:bg-white/[0.05] focus:border-white/15 focus:bg-white/[0.07] focus:outline-none ${noSpinner}`;
const cellSelectClass = cellInputClass + " appearance-none cursor-pointer";
const cellSubInputClass =
  `mt-1 block w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-[10px] text-zinc-400 placeholder:text-zinc-700 transition hover:bg-white/[0.05] focus:border-white/15 focus:bg-white/[0.07] focus:outline-none ${noSpinner}`;
const inputClass =
  `w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none ${noSpinner}`;
const labelClass = "mb-1 block text-xs font-semibold text-zinc-400";
const selectClass = inputClass + " appearance-none";

const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];
const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];

// Resizable data columns — drag the handle on the right edge of a header to
// widen/narrow it, like a spreadsheet. Non-data columns (checkbox, photo,
// action buttons) stay fixed since resizing those wouldn't do much.
type ColKey =
  | "year"
  | "make"
  | "model"
  | "trim"
  | "condition"
  | "dealType"
  | "msrp"
  | "payment"
  | "dueAtSigning"
  | "term"
  | "milesPerYear";

const COLUMNS: { key: ColKey; label: string; defaultWidth: number }[] = [
  { key: "year", label: "Year", defaultWidth: 76 },
  { key: "make", label: "Make", defaultWidth: 120 },
  { key: "model", label: "Model", defaultWidth: 150 },
  { key: "trim", label: "Trim", defaultWidth: 130 },
  { key: "condition", label: "Condition", defaultWidth: 110 },
  { key: "dealType", label: "Deal type", defaultWidth: 110 },
  { key: "msrp", label: "MSRP", defaultWidth: 120 },
  { key: "payment", label: "Payment", defaultWidth: 130 },
  { key: "dueAtSigning", label: "Due at signing", defaultWidth: 140 },
  { key: "term", label: "Term", defaultWidth: 80 },
  { key: "milesPerYear", label: "Mi/yr", defaultWidth: 100 },
];

const DEFAULT_WIDTHS: Record<ColKey, number> = COLUMNS.reduce(
  (acc, c) => ({ ...acc, [c.key]: c.defaultWidth }),
  {} as Record<ColKey, number>
);

const MIN_COL_WIDTH = 56;
const WIDTHS_STORAGE_KEY = "asd_my_listings_col_widths_v1";

// Fixed-width utility columns (checkbox, toggles, action buttons). No photo
// thumbnail column — it never had room to show anything useful at this
// density, so it's left out of this view (still editable via "More").
const UTILITY_WIDTHS = {
  select: 40,
  onePay: 64,
  inStock: 72,
  save: 88,
  seeCard: 96,
  more: 96,
  delete: 48,
};

const COLUMN_COUNT = 7 + COLUMNS.length; // utility columns + resizable columns
const th = "relative select-none px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-zinc-500";
const td = "px-2.5 py-2 align-top overflow-hidden";

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
  paymentTaxRate: string;
  dueAtSigning: string;
  dueAtSigningTaxRate: string;
  term: string;
  milesPerYear: string;
  apr: string;
  msrp: string;
  maskMsrp: boolean;
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
    paymentTaxRate: deal.paymentTaxRate != null ? String(deal.paymentTaxRate) : "",
    dueAtSigning: String(deal.dueAtSigning ?? ""),
    dueAtSigningTaxRate: deal.dueAtSigningTaxRate != null ? String(deal.dueAtSigningTaxRate) : "",
    term: String(deal.term ?? ""),
    milesPerYear: deal.milesPerYear != null ? String(deal.milesPerYear) : "",
    apr: deal.apr != null ? String(deal.apr) : "",
    msrp: String(deal.msrp ?? ""),
    maskMsrp: deal.maskMsrp ?? false,
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
  const [widths, setWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  const dragRef = useRef<{ col: ColKey; startX: number; startWidth: number } | null>(null);

  // Load any saved column widths once the page is hydrated (avoids an SSR
  // hydration mismatch, since the server always renders the defaults).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WIDTHS_STORAGE_KEY);
      // localStorage isn't available during SSR, so this has to happen
      // post-mount — intentionally syncing from a browser-only API, not
      // deriving from other React state, so the usual "don't setState in an
      // effect" guidance doesn't apply here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setWidths({ ...DEFAULT_WIDTHS, ...JSON.parse(saved) });
    } catch {
      // Ignore — just fall back to defaults.
    }
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      const next = Math.max(MIN_COL_WIDTH, d.startWidth + (e.clientX - d.startX));
      setWidths((prev) => {
        const updated = { ...prev, [d.col]: next };
        try {
          localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore storage failures — resizing still works for the session.
        }
        return updated;
      });
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function startResize(col: ColKey, e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { col, startX: e.clientX, startWidth: widths[col] };
  }

  function resetWidths() {
    setWidths(DEFAULT_WIDTHS);
    try {
      localStorage.removeItem(WIDTHS_STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }

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
          Click any field to edit it, then hit Save on that row. Drag a column&apos;s right edge to
          resize it, or{" "}
          <button type="button" onClick={resetWidths} className="underline decoration-dotted hover:text-white">
            reset column widths
          </button>
          . Expand a row (chevron) for everything else.
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

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2">
        <table className="table-fixed border-separate text-sm [border-spacing:0_4px]">
          <colgroup>
            <col style={{ width: UTILITY_WIDTHS.select }} />
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: widths[c.key] }} />
            ))}
            <col style={{ width: UTILITY_WIDTHS.onePay }} />
            <col style={{ width: UTILITY_WIDTHS.inStock }} />
            <col style={{ width: UTILITY_WIDTHS.save }} />
            <col style={{ width: UTILITY_WIDTHS.seeCard }} />
            <col style={{ width: UTILITY_WIDTHS.more }} />
            <col style={{ width: UTILITY_WIDTHS.delete }} />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-white/20 bg-white/5"
                  aria-label="Select all listings"
                />
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={th}>
                  <span className="block truncate pr-2">{c.label}</span>
                  <div
                    onMouseDown={(e) => startResize(c.key, e)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-white/20 active:bg-white/30"
                    title="Drag to resize"
                  />
                </th>
              ))}
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
  const rowBg = dirty ? "bg-amber-500/[0.07]" : "bg-white/[0.025]";
  const firstCell = `${td} ${rowBg} rounded-l-xl`;
  const cell = `${td} ${rowBg}`;
  const lastCell = `${td} ${rowBg} rounded-r-xl`;

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
      if (draft.paymentTaxRate) fd.set("paymentTaxRate", draft.paymentTaxRate);
      fd.set("dueAtSigning", draft.dueAtSigning);
      if (draft.dueAtSigningTaxRate) fd.set("dueAtSigningTaxRate", draft.dueAtSigningTaxRate);
      fd.set("term", draft.term);
      if (draft.milesPerYear) fd.set("milesPerYear", draft.milesPerYear);
      if (draft.apr) fd.set("apr", draft.apr);
      fd.set("msrp", draft.msrp);
      if (draft.maskMsrp) fd.set("maskMsrp", "on");
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

  return (
    <>
      <tr>
        <td className={firstCell}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="mt-1 rounded border-white/20 bg-white/5"
            aria-label={`Select ${draft.year} ${draft.make} ${draft.model}`}
          />
        </td>
        <td className={cell}>
          <input
            type="number"
            value={draft.year}
            onChange={(e) => set("year", e.target.value)}
            className={cellInputClass}
          />
        </td>
        <td className={cell}>
          <input
            type="text"
            value={draft.make}
            onChange={(e) => set("make", e.target.value)}
            className={cellInputClass}
          />
        </td>
        <td className={cell}>
          <input
            type="text"
            value={draft.model}
            onChange={(e) => set("model", e.target.value)}
            className={cellInputClass}
          />
        </td>
        <td className={cell}>
          <input
            type="text"
            value={draft.trim}
            onChange={(e) => set("trim", e.target.value)}
            className={cellInputClass}
          />
        </td>
        <td className={cell}>
          <select
            value={draft.condition}
            onChange={(e) => set("condition", e.target.value)}
            className={cellSelectClass}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </td>
        <td className={cell}>
          <select
            value={draft.dealType}
            onChange={(e) => set("dealType", e.target.value as "Lease" | "Finance")}
            className={cellSelectClass}
          >
            <option value="Lease">Lease</option>
            <option value="Finance">Finance</option>
          </select>
        </td>
        <td className={cell}>
          <input
            type="number"
            value={draft.msrp}
            onChange={(e) => set("msrp", e.target.value)}
            className={cellInputClass}
          />
          <label className="mt-1 flex cursor-pointer items-center gap-1 text-[10px] text-zinc-600">
            <input
              type="checkbox"
              checked={draft.maskMsrp}
              onChange={(e) => set("maskMsrp", e.target.checked)}
              className="h-3 w-3 shrink-0 rounded border-white/20 bg-white/5"
            />
            <span className="truncate">Mask</span>
          </label>
        </td>
        <td className={cell}>
          <input
            type="number"
            disabled={draft.onePay}
            value={draft.payment}
            onChange={(e) => set("payment", e.target.value)}
            className={`${cellInputClass} disabled:opacity-40`}
          />
          {!draft.onePay && (
            <input
              type="number"
              step="0.01"
              value={draft.paymentTaxRate}
              onChange={(e) => set("paymentTaxRate", e.target.value)}
              placeholder="tax % incl."
              className={cellSubInputClass}
            />
          )}
        </td>
        <td className={cell}>
          <input
            type="number"
            value={draft.dueAtSigning}
            onChange={(e) => set("dueAtSigning", e.target.value)}
            className={cellInputClass}
          />
          <input
            type="number"
            step="0.01"
            value={draft.dueAtSigningTaxRate}
            onChange={(e) => set("dueAtSigningTaxRate", e.target.value)}
            placeholder="tax % assumed"
            className={cellSubInputClass}
          />
        </td>
        <td className={cell}>
          <input
            type="number"
            value={draft.term}
            onChange={(e) => set("term", e.target.value)}
            className={cellInputClass}
          />
        </td>
        <td className={cell}>
          {draft.dealType === "Lease" ? (
            <input
              type="number"
              value={draft.milesPerYear}
              onChange={(e) => set("milesPerYear", e.target.value)}
              className={cellInputClass}
            />
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </td>
        <td className={cell}>
          {draft.dealType === "Lease" ? (
            <input
              type="checkbox"
              checked={draft.onePay}
              onChange={(e) => set("onePay", e.target.checked)}
              className="mt-1 rounded border-white/20 bg-white/5"
              aria-label="One-pay lease"
            />
          ) : (
            <span className="text-xs text-zinc-600">—</span>
          )}
        </td>
        <td className={cell}>
          <input
            type="checkbox"
            checked={draft.inStock}
            onChange={(e) => set("inStock", e.target.checked)}
            className="mt-1 rounded border-white/20 bg-white/5"
            aria-label="In stock"
          />
        </td>
        <td className={cell}>
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
        <td className={cell}>
          <Link
            href={`/deals/${deal.slug}`}
            target="_blank"
            className="flex items-center gap-1 text-xs font-semibold text-zinc-300 hover:text-white hover:underline"
          >
            See card <ExternalLink size={11} />
          </Link>
        </td>
        <td className={cell}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            More
          </button>
        </td>
        <td className={lastCell}>
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
        <tr>
          <td colSpan={COLUMN_COUNT} className="px-2.5 py-1">
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          </td>
        </tr>
      )}

      {expanded && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="rounded-xl bg-white/[0.03] p-4 sm:p-5">
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
