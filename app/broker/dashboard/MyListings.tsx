"use client";

import { TOTAL_PRICE_HINT } from "@/lib/cars-act";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minimize2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { msrpEditValue } from "@/lib/deal-utils";
import { PLACEHOLDER_IMAGE } from "@/lib/supabase/deals";
import { updateDealAction, deleteDealAction, deleteDealsAction, repullPhotoAction } from "./actions";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";
import LocationFields, { type LocationValue } from "./LocationFields";
import MileageOptionsEditor, { toMileageRows, type MileageRow } from "./MileageOptionsEditor";
import LeaseOptionsEditor, { toLeaseOptionRows, type LeaseOptionRow } from "./LeaseOptionsEditor";

// Borderless-until-touched inputs — the point is to read like an editable
// list, not a literal spreadsheet grid of boxes. A cell only "lights up"
// on hover/focus so the row stays visually calm until you interact with it.
// Also strips the native up/down spinner arrows browsers add to
// type="number" inputs, and forces a hard line-break ("block") so a
// secondary sub-field (like the tax-rate hint under Payment) always stacks
// under the main value instead of sitting inline and overflowing into the
// next column when the column is narrow.
// (The borderless/hover/focus/"block" styling lives in the `input-cell`
// component class in app/globals.css; the spinner strip stays here.)
const noSpinner =
  "[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const cellInputClass = `input-cell ${noSpinner}`;
const cellSelectClass = cellInputClass + " appearance-none cursor-pointer";
const cellSubInputClass = `input-cell input-cell-sub ${noSpinner}`;
const inputClass = `input input-sm ${noSpinner}`;
const labelClass = "field-label";
const selectClass = "select input-sm";
const textareaClass = "textarea input-sm";
// Save is a filled blue button only while its row has unsaved edits; a
// clean (disabled) row falls back to a quiet neutral pill, so a long list
// never turns into a column of blue buttons.
const saveDisabledClass = "disabled:bg-hover-strong disabled:text-fg-secondary disabled:shadow-none";

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
  | "msrp"
  | "payment"
  | "dueAtSigning"
  | "brokerFee"
  | "term"
  | "milesPerYear";

const COLUMNS: { key: ColKey; label: string; defaultWidth: number }[] = [
  { key: "year", label: "Year", defaultWidth: 76 },
  { key: "make", label: "Make", defaultWidth: 120 },
  { key: "model", label: "Model", defaultWidth: 150 },
  { key: "trim", label: "Trim", defaultWidth: 130 },
  { key: "condition", label: "Condition", defaultWidth: 110 },
  { key: "msrp", label: "MSRP", defaultWidth: 120 },
  { key: "payment", label: "Payment", defaultWidth: 130 },
  { key: "dueAtSigning", label: "Due at signing", defaultWidth: 140 },
  { key: "brokerFee", label: "Broker fee", defaultWidth: 110 },
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
const th = "relative select-none px-2 py-1.5 text-left text-[11px] font-medium text-fg-muted";
const td = "px-2 py-1.5 align-top overflow-hidden";

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
  brokerFee: string;
  msdCount: string;
  msdTotal: string;
  term: string;
  milesPerYear: string;
  location: LocationValue;
  apr: string;
  msrp: string;
  sellingPrice: string;
  inStock: boolean;
  notes: string;
  condition: string;
  images: string;
  incentives: IncentiveRow[];
  mileageOptions: MileageRow[];
  leaseOptions: LeaseOptionRow[];
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
    brokerFee: deal.brokerFee != null ? String(deal.brokerFee) : "",
    msdCount: deal.msdCount != null ? String(deal.msdCount) : "",
    msdTotal: deal.msdTotal != null ? String(deal.msdTotal) : "",
    term: String(deal.term ?? ""),
    milesPerYear: deal.milesPerYear != null ? String(deal.milesPerYear) : "",
    location: { city: deal.city ?? "", state: deal.state ?? "", delivery: deal.delivery ?? "" },
    apr: deal.apr != null ? String(deal.apr) : "",
    msrp: msrpEditValue(deal),
    sellingPrice: deal.sellingPrice != null ? String(deal.sellingPrice) : "",
    inStock: deal.inStock,
    notes: deal.notes ?? "",
    condition: deal.condition ?? "New",
    images: (deal.images ?? []).filter((i) => i !== PLACEHOLDER_IMAGE).join("\n"),
    incentives: (deal.incentives ?? []).map((inc) => ({
      ...inc,
      includedInPrice: inc.includedInPrice === true,
    })),
    mileageOptions: toMileageRows(deal.mileageOptions),
    leaseOptions: toLeaseOptionRows(deal.leaseOptions),
  };
}

export default function MyListings({
  deals,
  emptyMessage = "You don't have any live listings yet — use the form below to add one.",
  asAdmin = false,
}: {
  deals: Deal[];
  emptyMessage?: string;
  // On /admin/listings: saves and removals go through the admin path (any
  // broker's listing) instead of the broker's own.
  asAdmin?: boolean;
}) {
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
      <div className="card p-8 text-center text-sm text-fg-muted">{emptyMessage}</div>
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
        `Remove ${selected.size} listing${selected.size === 1 ? "" : "s"}? You can restore ${
          selected.size === 1 ? "it" : "them"
        } later from Removed listings.`
      )
    ) {
      return;
    }
    setBulkError(null);
    setBulkDeleting(true);
    try {
      const result = await deleteDealsAction(Array.from(selected), asAdmin);
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
        <p className="text-xs text-fg-muted">
          Click any field to edit it, then hit Save on that row. Drag a column&apos;s right edge to
          resize it, or{" "}
          <button
            type="button"
            onClick={resetWidths}
            className="link-quiet underline decoration-dotted underline-offset-4"
          >
            reset column widths
          </button>
          . Expand a row (chevron) for everything else.
        </p>
        <div className="flex items-center gap-2">
          {bulkError && <p className="text-xs text-danger">{bulkError}</p>}
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={selected.size === 0 || bulkDeleting}
            className="btn btn-danger btn-sm"
          >
            {bulkDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Delete selected {selected.size > 0 && `(${selected.size})`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-hover p-1">
        <table className="table-fixed border-separate text-sm [border-spacing:0_2px]">
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
                  className="checkbox"
                  aria-label="Select all listings"
                />
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={th}>
                  <span className="block truncate pr-2">{c.label}</span>
                  <div
                    onMouseDown={(e) => startResize(c.key, e)}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-line-hover active:bg-line-strong"
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
                asAdmin={asAdmin}
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
  asAdmin,
  deal,
  selected,
  onToggleSelect,
}: {
  asAdmin: boolean;
  deal: Deal;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const baseline = useMemo(() => deriveDraft(deal), [deal]);
  const [draft, setDraft] = useState<RowDraft>(baseline);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [repulling, setRepulling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Feedback after "Re-pull photo" — the new photo is only kept once the
  // row is saved, which is easy to miss otherwise.
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  // Photos "Re-pull photo" has already swapped out this session, so it
  // doesn't hand them back.
  const triedPhotos = useRef<Set<string>>(new Set());

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const rowBg = dirty ? "bg-warning-soft" : "bg-hover";
  const firstCell = `${td} ${rowBg} rounded-l-lg`;
  const cell = `${td} ${rowBg}`;
  const lastCell = `${td} ${rowBg} rounded-r-lg`;

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
      if (draft.brokerFee) fd.set("brokerFee", draft.brokerFee);
      if (draft.msdCount) fd.set("msdCount", draft.msdCount);
      if (draft.msdTotal) fd.set("msdTotal", draft.msdTotal);
      fd.set("term", draft.term);
      if (draft.milesPerYear) fd.set("milesPerYear", draft.milesPerYear);
      if (draft.apr) fd.set("apr", draft.apr);
      fd.set("msrp", draft.msrp);
      if (draft.sellingPrice) fd.set("sellingPrice", draft.sellingPrice);
      if (draft.inStock) fd.set("inStock", "on");
      fd.set("notes", draft.notes);
      fd.set("condition", draft.condition);
      fd.set("city", draft.location.city);
      fd.set("state", draft.location.state);
      fd.set("delivery", draft.location.delivery);
      fd.set(
        "incentives",
        JSON.stringify(
          draft.incentives.filter((r) => r.name.trim() && (r.amount > 0 || (r.monthly ?? 0) > 0 || r.includedInPrice))
        )
      );
      fd.set(
        "mileageOptions",
        JSON.stringify(
          draft.mileageOptions
            .filter((r) => r.milesPerYear.trim() && r.monthlyDelta.trim())
            .map((r) => ({ milesPerYear: Number(r.milesPerYear), monthlyDelta: Number(r.monthlyDelta) }))
        )
      );
      fd.set(
        "leaseOptions",
        JSON.stringify(
          draft.leaseOptions
            .filter((r) => r.term.trim() && r.payment.trim())
            .map((r) => ({
              term: Number(r.term),
              milesPerYear: r.milesPerYear.trim() ? Number(r.milesPerYear) : null,
              payment: Number(r.payment),
            }))
        )
      );
      fd.set("images", draft.images);
      if (asAdmin) fd.set("asAdmin", "1");

      const result = await updateDealAction(fd);
      if (result.error) setError(result.error);
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRepullPhoto() {
    setError(null);
    setPhotoNotice(null);
    setRepulling(true);
    try {
      const result = await repullPhotoAction({
        year: Number(draft.year),
        make: draft.make,
        model: draft.model,
        trim: draft.trim || undefined,
        color: draft.exterior || undefined,
        current: [
          ...draft.images
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          ...triedPhotos.current,
        ],
      });
      if (result.error) {
        setPhotoNotice(result.error);
      } else if (result.imageUrl) {
        setPhotoNotice("New main photo — click Save to keep it, or Re-pull again for another.");
        // The new photo replaces the current main (cover) photo rather than
        // piling up behind it — the old one is usually why the broker is
        // re-pulling. Any extra photos below it stay as they are.
        const [oldMain, ...extras] = draft.images
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (oldMain) triedPhotos.current.add(oldMain);
        set("images", [result.imageUrl, ...extras.filter((s) => s !== result.imageUrl)].join("\n"));
      }
    } catch {
      setPhotoNotice("Couldn't fetch a new photo — try again.");
    } finally {
      setRepulling(false);
    }
  }

  async function handleDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove this listing? You can restore it later from Removed listings.")
    ) {
      return;
    }
    setDeleting(true);
    try {
      const fd = new FormData();
      fd.set("id", deal.id);
      if (asAdmin) fd.set("asAdmin", "1");
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
            className="checkbox mt-1"
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
          <input
            type="text"
            inputMode="numeric"
            value={draft.msrp}
            onChange={(e) => set("msrp", e.target.value)}
            placeholder="65000 or 65,xxx"
            className={cellInputClass}
          />
          <p className="mt-1 truncate text-[11px] text-fg-muted" title="Type x's to hide digits, e.g. 65,xxx">
            x&apos;s = hidden
          </p>
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
            step="0.01"
            value={draft.brokerFee}
            onChange={(e) => set("brokerFee", e.target.value)}
            placeholder="595"
            className={cellInputClass}
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
          <input
            type="number"
            value={draft.milesPerYear}
            onChange={(e) => set("milesPerYear", e.target.value)}
            className={cellInputClass}
          />
        </td>
        <td className={cell}>
          <input
            type="checkbox"
            checked={draft.onePay}
            onChange={(e) => set("onePay", e.target.checked)}
            className="checkbox mt-1"
            aria-label="One-pay lease"
          />
        </td>
        <td className={cell}>
          <input
            type="checkbox"
            checked={draft.inStock}
            onChange={(e) => set("inStock", e.target.checked)}
            className="checkbox mt-1"
            aria-label="In stock"
          />
        </td>
        <td className={cell}>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`btn btn-primary btn-sm gap-1.5 px-3 ${saveDisabledClass}`}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save
          </button>
        </td>
        <td className={cell}>
          <Link
            href={`/deals/${deal.slug}`}
            target="_blank"
            className="link-arrow min-h-9 whitespace-nowrap"
          >
            See card <ExternalLink />
          </Link>
        </td>
        <td className={cell}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="btn btn-secondary btn-sm gap-1 px-3"
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
            More
          </button>
        </td>
        <td className={lastCell}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="btn btn-ghost btn-icon btn-sm text-danger"
            aria-label="Delete listing"
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </button>
        </td>
      </tr>

      {error && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="px-2.5 py-1">
            <p role="alert" className="alert alert-danger px-3 py-2 text-xs leading-5">
              {error}
            </p>
          </td>
        </tr>
      )}

      {expanded && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="rounded-xl border border-line bg-hover p-4 sm:p-5">
            {/* Never submitted — Save sends the draft below — so Enter in a
                field doesn't reload the page. */}
            <form onSubmit={(e) => e.preventDefault()} className="space-y-3">

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor={`listing-${deal.id}-body-style`} className={labelClass}>
                    Body style
                  </label>
                  <select
                    id={`listing-${deal.id}-body-style`}
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
                  <label htmlFor={`listing-${deal.id}-fuel`} className={labelClass}>
                    Fuel type
                  </label>
                  <select
                    id={`listing-${deal.id}-fuel`}
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
                  <label htmlFor={`listing-${deal.id}-exterior`} className={labelClass}>
                    Exterior color
                  </label>
                  <input
                    id={`listing-${deal.id}-exterior`}
                    type="text"
                    value={draft.exterior}
                    onChange={(e) => set("exterior", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`listing-${deal.id}-interior`} className={labelClass}>
                    Interior color
                  </label>
                  <input
                    id={`listing-${deal.id}-interior`}
                    type="text"
                    value={draft.interior}
                    onChange={(e) => set("interior", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`listing-${deal.id}-selling-price`} className={labelClass}>
                    Total price
                  </label>
                  <input
                    id={`listing-${deal.id}-selling-price`}
                    type="number"
                    value={draft.sellingPrice}
                    onChange={(e) => set("sellingPrice", e.target.value)}
                    className={inputClass}
                  />
                  <p className="field-hint">{TOTAL_PRICE_HINT}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`listing-${deal.id}-msd-count`} className={labelClass}>
                      MSDs (optional)
                    </label>
                    <input
                      id={`listing-${deal.id}-msd-count`}
                      type="number"
                      min={1}
                      max={20}
                      value={draft.msdCount}
                      onChange={(e) => set("msdCount", e.target.value)}
                      placeholder="7"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor={`listing-${deal.id}-msd-total`} className={labelClass}>
                      MSD total
                    </label>
                    <input
                      id={`listing-${deal.id}-msd-total`}
                      type="number"
                      value={draft.msdTotal}
                      onChange={(e) => set("msdTotal", e.target.value)}
                      placeholder="6300"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <LocationFields
                idPrefix={`listing-${deal.id}`}
                value={draft.location}
                onChange={(location) => set("location", location)}
              />

              <IncentivesEditor
                value={draft.incentives}
                onChange={(rows) => set("incentives", rows)}
              />

              <MileageOptionsEditor
                value={draft.mileageOptions}
                onChange={(rows) => set("mileageOptions", rows)}
              />

              <LeaseOptionsEditor value={draft.leaseOptions} onChange={(rows) => set("leaseOptions", rows)} />

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={`listing-${deal.id}-images`} className={labelClass}>
                    Photo URLs (one per line, optional)
                  </label>
                  <button
                    type="button"
                    onClick={handleRepullPhoto}
                    disabled={repulling || !draft.year || !draft.make.trim() || !draft.model.trim()}
                    className="btn btn-secondary btn-sm mb-1.5"
                  >
                    {repulling ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Re-pull photo
                  </button>
                </div>
                {photoNotice && (
                  <p role="status" className="mb-2 text-xs text-fg-secondary">
                    {photoNotice}
                  </p>
                )}
                {draft.images.split("\n")[0]?.trim() && (
                  <div className="media-stage mb-2 aspect-[4/3] w-full max-w-[160px] rounded-lg">
                    <img
                      src={draft.images.split("\n")[0].trim()}
                      alt="Current primary photo"
                      className="media-img"
                    />
                  </div>
                )}
                <textarea
                  id={`listing-${deal.id}-images`}
                  value={draft.images}
                  onChange={(e) => set("images", e.target.value)}
                  placeholder="https://example.com/photo1.jpg"
                  className={`${textareaClass} min-h-16 resize-y font-mono`}
                />
                <p className="field-hint">
                  &quot;Re-pull photo&quot; looks up a fresh stock photo for this exact
                  year/make/model/trim and puts it first — review it, then hit Save to keep it.
                </p>
              </div>

              <div>
                <label htmlFor={`listing-${deal.id}-notes`} className={labelClass}>
                  Notes
                </label>
                <textarea
                  id={`listing-${deal.id}-notes`}
                  value={draft.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  className={`${textareaClass} min-h-20 resize-y`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className={`btn btn-primary btn-sm ${saveDisabledClass}`}
                >
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  Save changes
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="btn btn-secondary btn-sm"
                  title="Collapse this row's edit panel — any unsaved changes stick around until you reopen it"
                >
                  <Minimize2 />
                  Minimize
                </button>
                <span className="text-xs text-fg-muted">Goes live immediately</span>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
