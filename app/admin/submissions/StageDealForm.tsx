"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { stageDealDraftAction, type StageDealState } from "./actions";

const initialState: StageDealState = { error: null };

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-zinc-400";
const selectClass = inputClass + " appearance-none";

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];

export default function StageDealForm({
  submissionId,
  brokerId,
  defaultSourceUrl,
}: {
  submissionId: string;
  brokerId: string;
  defaultSourceUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(stageDealDraftAction, initialState);
  const [dealType, setDealType] = useState<"Lease" | "Finance">("Lease");
  const [onePay, setOnePay] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
      >
        <Plus size={14} /> Stage a car from this submission
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Stage a car draft</p>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
          <X size={16} />
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Enter what you read from their source. It lands in this broker&apos;s dashboard as a
        pending draft — they confirm or uncheck it before it goes live.
      </p>

      <form action={formAction} className="mt-3 space-y-3" key={state.success ? "reset" : "form"}>
        <input type="hidden" name="submissionId" value={submissionId} />
        <input type="hidden" name="brokerId" value={brokerId} />

        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Year</label>
            <input required type="number" name="year" placeholder="2026" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Make</label>
            <input required type="text" name="make" placeholder="BMW" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Model</label>
            <input required type="text" name="model" placeholder="X5" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Trim (optional)</label>
            <input type="text" name="trim" placeholder="xDrive40i" className={inputClass} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <label className={labelClass}>Body style (optional)</label>
            <select name="bodyStyle" defaultValue="" className={selectClass}>
              <option value="">Not specified</option>
              {BODY_STYLES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Fuel (optional)</label>
            <select name="fuel" defaultValue="" className={selectClass}>
              <option value="">Not specified</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Exterior (optional)</label>
            <input type="text" name="exterior" placeholder="Alpine White" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Interior (optional)</label>
            <input type="text" name="interior" placeholder="Black" className={inputClass} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
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
            <input required type="number" name="msrp" placeholder="65000" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Selling price (optional)</label>
            <input type="number" name="sellingPrice" placeholder="61000" className={inputClass} />
          </div>
        </div>

        {dealType === "Lease" && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              name="onePay"
              checked={onePay}
              onChange={(e) => setOnePay(e.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            One-pay lease
          </label>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className={labelClass}>{onePay ? "One-pay total" : "Payment"}</label>
            <input
              required={!onePay}
              disabled={onePay}
              type="number"
              name="payment"
              placeholder={onePay ? "0" : "799"}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Due at signing</label>
            <input required type="number" name="dueAtSigning" placeholder="4999" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Term (months)</label>
            <input required type="number" name="term" placeholder="36" className={inputClass} />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {dealType === "Lease" && (
            <div>
              <label className={labelClass}>Miles/year</label>
              <input required type="number" name="milesPerYear" placeholder="10000" className={inputClass} />
            </div>
          )}
          {dealType === "Finance" && (
            <div>
              <label className={labelClass}>APR (%)</label>
              <input type="number" step="0.01" name="apr" placeholder="4.9" className={inputClass} />
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Photo URLs (optional, one per line)</label>
          <textarea
            name="images"
            placeholder={"https://example.com/photo1.jpg"}
            className={`${inputClass} min-h-16 resize-y font-mono text-xs`}
          />
          <p className="mt-1 text-xs text-zinc-600">
            Leave blank to try pulling a matching stock photo automatically.
          </p>
        </div>

        <div>
          <label className={labelClass}>Source URL (optional)</label>
          <input
            type="url"
            name="sourceUrl"
            defaultValue={defaultSourceUrl}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Notes</label>
          <textarea name="notes" className={`${inputClass} min-h-16 resize-y`} />
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Staged — it&apos;s now waiting for the broker to confirm in their dashboard.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
        >
          {pending ? "Staging..." : "Stage this car"}
        </button>
      </form>
    </div>
  );
}
