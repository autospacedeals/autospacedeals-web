"use client";

import { Plus, X } from "lucide-react";

export interface IncentiveRow {
  name: string;
  amount: number;
  // Whether the advertised payment/due-at-signing already assumes this
  // incentive is applied. Drives the default checked state of the
  // matching toggle in the shopper-facing payment estimator: checked by
  // default (unchecking removes it and raises the estimate) when true,
  // unchecked by default (checking it applies it and lowers the estimate)
  // when false. See PaymentEstimator.tsx.
  includedInPrice: boolean;
  // How much the monthly payment moves with vs. without it ("no Loyalty
  // +$15" -> 15). Optional; when set the estimator uses it directly.
  monthly?: number;
}

const inputClass = "input input-sm";
const labelClass = "field-label";

// Add/remove/edit incentive rows for a listing. Always writes the
// finalized list to a hidden `incentives` JSON field the server action
// reads on submit.
export default function IncentivesEditor({
  value,
  onChange,
}: {
  value: IncentiveRow[];
  onChange: (rows: IncentiveRow[]) => void;
}) {
  function updateRow(idx: number, patch: Partial<IncentiveRow>) {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function addRow() {
    onChange([...value, { name: "", amount: 0, includedInPrice: false }]);
  }

  return (
    <div>
      <label className={`${labelClass} mb-1.5`}>Incentives (optional)</label>
      <p className="mb-3 text-xs leading-5 text-fg-muted">
        Things like loyalty, fleet, or military discounts a shopper might qualify for. Give a dollar
        amount, what it&apos;s worth per month (e.g. &quot;no Loyalty +$15&quot; is $15/mo), or both —
        shoppers can toggle each one on the deal page.
      </p>

      {value.length > 0 && (
        <div className="mb-2 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-medium text-fg-muted">
            <span className="w-9 shrink-0 text-center">Incl.</span>
            <span className="flex-[2]">Incentive name</span>
            <span className="flex-1">Amount $</span>
            <span className="flex-1">Per month $</span>
            {/* Spacer matching the remove button (btn-sm grows to 44px on touch). */}
            <span className="w-9 shrink-0 pointer-coarse:w-11" />
          </div>
          {value.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span
                className="flex w-9 shrink-0 justify-center"
                title="Check this if the advertised payment/due-at-signing already assumes this incentive is applied"
              >
                <input
                  type="checkbox"
                  checked={row.includedInPrice}
                  onChange={(e) => updateRow(idx, { includedInPrice: e.target.checked })}
                  className="checkbox"
                  aria-label="Already included in advertised price"
                />
              </span>
              <input
                type="text"
                placeholder="e.g. Loyalty"
                aria-label="Incentive name"
                value={row.name}
                onChange={(e) => updateRow(idx, { name: e.target.value })}
                className={`${inputClass} min-w-0 flex-[2]`}
              />
              <input
                type="number"
                min={0}
                placeholder="500"
                aria-label="Amount in dollars"
                value={row.amount || ""}
                onChange={(e) => updateRow(idx, { amount: Number(e.target.value) || 0 })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <input
                type="number"
                min={0}
                placeholder="15"
                aria-label="Worth per month in dollars"
                value={row.monthly || ""}
                onChange={(e) => updateRow(idx, { monthly: Number(e.target.value) || undefined })}
                className={`${inputClass} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="btn btn-ghost btn-icon btn-sm text-fg-muted hover:text-danger"
                aria-label="Remove incentive"
              >
                <X />
              </button>
            </div>
          ))}
          <p className="text-xs leading-5 text-fg-muted">
            Check &quot;Incl.&quot; if the payment/due-at-signing you entered above already
            assumes this incentive applies. Leave it unchecked for a stackable incentive not yet
            reflected in those numbers.
          </p>
        </div>
      )}

      <button type="button" onClick={addRow} className="btn btn-ghost btn-sm -ml-3">
        <Plus /> Add incentive
      </button>

      <input
        type="hidden"
        name="incentives"
        value={JSON.stringify(
          value
            .filter((r) => r.name.trim() && (r.amount > 0 || (r.monthly ?? 0) > 0))
            .map(({ name, amount, includedInPrice, monthly }) => ({ name, amount, includedInPrice, monthly }))
        )}
      />
    </div>
  );
}
