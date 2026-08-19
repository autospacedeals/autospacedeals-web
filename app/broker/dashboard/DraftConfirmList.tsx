"use client";

import { useState } from "react";
import { CheckSquare, Square, Pencil, X } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency, msrpEditValue } from "@/lib/deal-utils";
import { PLACEHOLDER_IMAGE } from "@/lib/supabase/deals";
import { confirmDraftsAction, updateDraftDealAction } from "./actions";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-zinc-400";
const selectClass = inputClass + " appearance-none";

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];
const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];

export default function DraftConfirmList({ drafts }: { drafts: Deal[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set(drafts.map((d) => d.id)));
  const [confirming, setConfirming] = useState(false);

  if (drafts.length === 0) return null;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    setConfirming(true);
    const fd = new FormData();
    drafts.forEach((d) => fd.append("draftId", d.id));
    checked.forEach((id) => fd.append("keep", id));
    await confirmDraftsAction(fd);
    setConfirming(false);
  }

  return (
    <div className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.06] p-6 sm:p-8">
      <h2 className="text-lg font-bold">Cars ready for your confirmation</h2>
      <p className="mt-1 text-sm text-zinc-400">
        We pulled these from a source you submitted. Hit &quot;Edit&quot; to fill in anything
        missing or fix something we got wrong, uncheck anything that&apos;s sold or outdated, then
        confirm to publish the rest.
      </p>

      <div className="mt-5 space-y-2">
        {drafts.map((deal) => (
          <DraftRow key={deal.id} deal={deal} checked={checked.has(deal.id)} onToggle={() => toggle(deal.id)} />
        ))}
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={confirming}
        className="mt-3 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        {confirming ? "Publishing..." : `Confirm & publish selected (${checked.size})`}
      </button>
    </div>
  );
}

function DraftRow({
  deal,
  checked,
  onToggle,
}: {
  deal: Deal;
  checked: boolean;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onePay, setOnePay] = useState(deal.onePay);
  const [incentives, setIncentives] = useState<IncentiveRow[]>(deal.incentives ?? []);

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950/40 p-3.5">
        <button type="button" onClick={onToggle} className="shrink-0 text-white" aria-label="Toggle selected">
          {checked ? <CheckSquare size={20} /> : <Square size={20} className="text-zinc-500" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{dealTitle(deal)}</p>
          <p className="text-xs text-zinc-500">
            {deal.onePay ? `${formatCurrency(deal.dueAtSigning)} one-pay` : `${formatCurrency(deal.payment)}/mo`}
            {" · "}
            {formatCurrency(deal.dueAtSigning)} due at signing · {deal.term}mo
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
        >
          <Pencil size={12} /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/20 bg-white/[0.05] p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{dealTitle(deal)}</p>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-zinc-500 hover:text-white"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <form
        action={async (formData) => {
          setError(null);
          const result = await updateDraftDealAction(formData);
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

        <input type="hidden" name="dealType" value={deal.dealType} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>MSRP</label>
            <input
              required
              type="text"
              inputMode="numeric"
              name="msrp"
              defaultValue={msrpEditValue(deal)}
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Type x&apos;s for any digits to hide from shoppers (e.g. 54,xxx) — the exact number
              won&apos;t be saved.
            </p>
          </div>
          <div>
            <label className={labelClass}>Selling price (optional)</label>
            <input type="number" name="sellingPrice" defaultValue={deal.sellingPrice ?? ""} className={inputClass} />
          </div>
        </div>

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

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>{onePay ? "One-pay total" : "Monthly payment"}</label>
            <input
              required={!onePay}
              disabled={onePay}
              type="number"
              name="payment"
              defaultValue={deal.payment || ""}
              className={inputClass}
            />
            {!onePay && (
              <input
                type="number"
                step="0.01"
                name="paymentTaxRate"
                defaultValue={deal.paymentTaxRate ?? ""}
                placeholder="If tax is included, assumed tax % (optional)"
                className={`${inputClass} mt-1.5 text-xs`}
              />
            )}
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
          <div>
            <label className={labelClass}>Broker fee (optional)</label>
            <input
              type="number"
              step="0.01"
              name="brokerFee"
              defaultValue={deal.brokerFee ?? ""}
              placeholder="595"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Shown to shoppers as its own line item, separate from due at signing.
            </p>
          </div>
        </div>

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
          <textarea name="notes" defaultValue={deal.notes} className={`${inputClass} min-h-16 resize-y`} />
        </div>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
