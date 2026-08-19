"use client";

import { useState } from "react";
import { Sparkles, Plus, X, Loader2 } from "lucide-react";
import { suggestIncentivesAction } from "./actions";

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
}

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-zinc-400";

// Add/remove/edit incentive rows for a listing, plus an AI-assisted
// "Suggest with AI" button. Reads year/make/model/trim straight off the
// enclosing <form> at click time (via the button's .form and FormData) so it
// drops into any of the three car forms without extra prop plumbing. Always
// writes the finalized list to a hidden `incentives` JSON field the server
// action reads on submit.
export default function IncentivesEditor({
  value,
  onChange,
}: {
  value: IncentiveRow[];
  onChange: (rows: IncentiveRow[]) => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  function updateRow(idx: number, patch: Partial<IncentiveRow>) {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function addRow() {
    onChange([...value, { name: "", amount: 0, includedInPrice: false }]);
  }

  async function handleSuggest(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form;
    const fd = form ? new FormData(form) : null;
    const year = Number(fd?.get("year") || 0);
    const make = String(fd?.get("make") || "").trim();
    const model = String(fd?.get("model") || "").trim();
    const trim = String(fd?.get("trim") || "").trim();

    if (!year || !make || !model) {
      setSuggestError("Fill in year/make/model above first.");
      return;
    }

    setSuggestError(null);
    setSuggesting(true);
    try {
      const result = await suggestIncentivesAction({ year, make, model, trim: trim || undefined });
      if (result.error) {
        setSuggestError(result.error);
      } else if (result.incentives.length === 0) {
        setSuggestError("No suggestions found — add incentives manually below.");
      } else {
        onChange([
          ...value,
          ...result.incentives.map((inc) => ({ ...inc, includedInPrice: false })),
        ]);
      }
    } catch {
      setSuggestError("Couldn't get suggestions right now — add incentives manually below.");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className={labelClass}>Incentives (optional)</label>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={suggesting}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
        >
          {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {suggesting ? "Thinking..." : "Suggest with AI"}
        </button>
      </div>
      <p className="mb-2 text-xs text-zinc-600">
        Things like loyalty, fleet, or military discounts a shopper might qualify for. AI
        suggestions are ballpark starting points, not confirmed offers — double-check the amount
        before publishing.
      </p>

      {value.length > 0 && (
        <div className="mb-2 space-y-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <span className="w-9 shrink-0 text-center">Incl.</span>
            <span className="flex-1">Incentive name</span>
            <span className="w-28 shrink-0">Amount</span>
            <span className="w-4 shrink-0" />
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
                  className="rounded border-white/20 bg-white/5"
                  aria-label="Already included in advertised price"
                />
              </span>
              <input
                type="text"
                placeholder="e.g. Loyalty"
                value={row.name}
                onChange={(e) => updateRow(idx, { name: e.target.value })}
                className={inputClass}
              />
              <input
                type="number"
                placeholder="500"
                value={row.amount || ""}
                onChange={(e) => updateRow(idx, { amount: Number(e.target.value) || 0 })}
                className={`${inputClass} w-28 shrink-0`}
              />
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="shrink-0 text-zinc-500 hover:text-red-400"
                aria-label="Remove incentive"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <p className="text-xs text-zinc-600">
            Check &quot;Incl.&quot; if the payment/due-at-signing you entered above already
            assumes this incentive applies. Leave it unchecked for a stackable incentive not yet
            reflected in those numbers — shoppers can toggle it on the deal page either way.
          </p>
        </div>
      )}

      {suggestError && <p className="mb-2 text-xs text-amber-400">{suggestError}</p>}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 transition hover:text-white"
      >
        <Plus size={12} /> Add incentive manually
      </button>

      <input
        type="hidden"
        name="incentives"
        value={JSON.stringify(value.filter((r) => r.name.trim() && r.amount > 0))}
      />
    </div>
  );
}
