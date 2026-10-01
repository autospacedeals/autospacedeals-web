"use client";

import { Plus, X } from "lucide-react";
import type { MileageOption } from "@/lib/deals-data";

// Kept as typed strings so a field can be cleared mid-edit.
export interface MileageRow {
  milesPerYear: string;
  monthlyDelta: string;
}

export function toMileageRows(options: MileageOption[] | undefined): MileageRow[] {
  return (options ?? []).map((o) => ({ milesPerYear: String(o.milesPerYear), monthlyDelta: String(o.monthlyDelta) }));
}

const inputClass = "input input-sm";

// Other mileage allowances a lease is offered at and what each adds to the
// monthly payment ("12k +$45"), so shoppers can pick one in the deal page's
// payment estimator. Writes a hidden `mileageOptions` JSON field; the
// server drops incomplete rows and the advertised mileage itself.
export default function MileageOptionsEditor({
  value,
  onChange,
}: {
  value: MileageRow[];
  onChange: (rows: MileageRow[]) => void;
}) {
  function updateRow(idx: number, patch: Partial<MileageRow>) {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div>
      <label className="field-label mb-1.5">Other mileage options (optional)</label>
      <p className="mb-3 text-xs leading-5 text-fg-muted">
        If the payment changes at other mileages (e.g. 12,000 mi/yr is +$45/mo), add them here so
        shoppers can compare. Use a minus sign for a mileage that costs less.
      </p>

      {value.length > 0 && (
        <div className="mb-2 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium text-fg-muted">
            <span className="flex-1">Miles per year</span>
            <span className="flex-1">Change per month $</span>
            <span className="w-9 shrink-0 pointer-coarse:w-11" />
          </div>
          {value.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="number"
                min={1000}
                step={500}
                placeholder="12000"
                aria-label="Miles per year"
                value={row.milesPerYear}
                onChange={(e) => updateRow(idx, { milesPerYear: e.target.value })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <input
                type="number"
                placeholder="45"
                aria-label="Change to the monthly payment in dollars"
                value={row.monthlyDelta}
                onChange={(e) => updateRow(idx, { monthlyDelta: e.target.value })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== idx))}
                className="btn btn-ghost btn-icon btn-sm text-fg-muted hover:text-danger"
                aria-label="Remove mileage option"
              >
                <X />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...value, { milesPerYear: "", monthlyDelta: "" }])}
        className="btn btn-ghost btn-sm -ml-3"
      >
        <Plus /> Add mileage option
      </button>

      <input
        type="hidden"
        name="mileageOptions"
        value={JSON.stringify(
          value
            .filter((r) => r.milesPerYear.trim() && r.monthlyDelta.trim())
            .map((r) => ({ milesPerYear: Number(r.milesPerYear), monthlyDelta: Number(r.monthlyDelta) }))
        )}
      />
    </div>
  );
}
