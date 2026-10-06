"use client";

import { Plus, X } from "lucide-react";
import type { LeaseOption } from "@/lib/deals-data";

// Kept as typed strings so a field can be cleared mid-edit.
export interface LeaseOptionRow {
  term: string;
  milesPerYear: string;
  payment: string;
}

export function toLeaseOptionRows(options: LeaseOption[] | undefined): LeaseOptionRow[] {
  return (options ?? []).map((o) => ({
    term: String(o.term),
    milesPerYear: o.milesPerYear ? String(o.milesPerYear) : "",
    payment: String(o.payment),
  }));
}

const inputClass = "input input-sm";

// Other lease terms the same car is priced at ("36 mo · 10,000 mi · $356"),
// as exact payments, so shoppers can pick a term on the deal page. Writes a
// hidden `leaseOptions` JSON field; the server drops incomplete rows and
// the listing's own term + mileage.
export default function LeaseOptionsEditor({
  value,
  onChange,
}: {
  value: LeaseOptionRow[];
  onChange: (rows: LeaseOptionRow[]) => void;
}) {
  function updateRow(idx: number, patch: Partial<LeaseOptionRow>) {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div>
      <label className="field-label mb-1.5">Other lease terms (optional)</label>
      <p className="mb-3 text-xs leading-5 text-fg-muted">
        If you offer this car at other terms (e.g. 36 months at $345/mo), add each with its mileage and
        payment. Shoppers pick the one they want on the deal page.
      </p>

      {value.length > 0 && (
        <div className="mb-2 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium text-fg-muted">
            <span className="flex-1">Months</span>
            <span className="flex-1">Miles per year</span>
            <span className="flex-1">Payment $/mo</span>
            <span className="w-9 shrink-0 pointer-coarse:w-11" />
          </div>
          {value.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="number"
                min={6}
                max={84}
                placeholder="36"
                aria-label="Term in months"
                value={row.term}
                onChange={(e) => updateRow(idx, { term: e.target.value })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <input
                type="number"
                min={1000}
                step={500}
                placeholder="10000"
                aria-label="Miles per year"
                value={row.milesPerYear}
                onChange={(e) => updateRow(idx, { milesPerYear: e.target.value })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <input
                type="number"
                min={0}
                placeholder="356"
                aria-label="Monthly payment in dollars"
                value={row.payment}
                onChange={(e) => updateRow(idx, { payment: e.target.value })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== idx))}
                className="btn btn-ghost btn-icon btn-sm text-fg-muted hover:text-danger"
                aria-label="Remove lease term"
              >
                <X />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...value, { term: "", milesPerYear: "", payment: "" }])}
        className="btn btn-ghost btn-sm -ml-3"
      >
        <Plus /> Add lease term
      </button>

      <input
        type="hidden"
        name="leaseOptions"
        value={JSON.stringify(
          value
            .filter((r) => r.term.trim() && r.payment.trim())
            .map((r) => ({
              term: Number(r.term),
              milesPerYear: r.milesPerYear.trim() ? Number(r.milesPerYear) : null,
              payment: Number(r.payment),
            }))
        )}
      />
    </div>
  );
}
