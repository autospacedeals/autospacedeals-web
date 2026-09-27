"use client";

import { useActionState, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { stageDealDraftAction, type StageDealState } from "./actions";
import IncentivesEditor, { type IncentiveRow } from "@/app/broker/dashboard/IncentivesEditor";

const initialState: StageDealState = { error: null };

const inputClass = "input input-sm";
const labelClass = "field-label";
const selectClass = "select input-sm";
const textareaClass = "textarea input-sm min-h-16 resize-y";

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];
const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];

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
  const [onePay, setOnePay] = useState(false);
  const [incentives, setIncentives] = useState<IncentiveRow[]>([]);
  // Unique per instance — the queue renders one of these for every pending
  // submission, so label/field ids can't be hard-coded.
  const uid = useId();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-sm mt-4">
        <Plus /> Stage a car from this submission
      </button>
    );
  }

  return (
    <div className="well mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">Stage a car draft</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="btn btn-ghost btn-icon btn-sm -my-1 -mr-1.5"
        >
          <X />
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-fg-muted">
        Enter what you read from their source. It lands in this broker&apos;s dashboard as a
        pending draft — they confirm or uncheck it before it goes live.
      </p>

      <form action={formAction} className="mt-4 space-y-4" key={state.success ? "reset" : "form"}>
        <input type="hidden" name="submissionId" value={submissionId} />
        <input type="hidden" name="brokerId" value={brokerId} />

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor={`${uid}-year`} className={labelClass}>
              Year
            </label>
            <input
              required
              type="number"
              id={`${uid}-year`}
              name="year"
              placeholder="2026"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-make`} className={labelClass}>
              Make
            </label>
            <input
              required
              type="text"
              id={`${uid}-make`}
              name="make"
              placeholder="BMW"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-model`} className={labelClass}>
              Model
            </label>
            <input
              required
              type="text"
              id={`${uid}-model`}
              name="model"
              placeholder="X5"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-trim`} className={labelClass}>
              Trim (optional)
            </label>
            <input
              type="text"
              id={`${uid}-trim`}
              name="trim"
              placeholder="xDrive40i"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor={`${uid}-condition`} className={labelClass}>
              Condition
            </label>
            <select
              id={`${uid}-condition`}
              name="condition"
              defaultValue="New"
              className={selectClass}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-bodyStyle`} className={labelClass}>
              Body style (optional)
            </label>
            <select
              id={`${uid}-bodyStyle`}
              name="bodyStyle"
              defaultValue=""
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
            <label htmlFor={`${uid}-fuel`} className={labelClass}>
              Fuel (optional)
            </label>
            <select id={`${uid}-fuel`} name="fuel" defaultValue="" className={selectClass}>
              <option value="">Not specified</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-exterior`} className={labelClass}>
              Exterior (optional)
            </label>
            <input
              type="text"
              id={`${uid}-exterior`}
              name="exterior"
              placeholder="Alpine White"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-interior`} className={labelClass}>
              Interior (optional)
            </label>
            <input
              type="text"
              id={`${uid}-interior`}
              name="interior"
              placeholder="Black"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-msrp`} className={labelClass}>
              MSRP
            </label>
            <input
              required
              type="number"
              id={`${uid}-msrp`}
              name="msrp"
              placeholder="65000"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-sellingPrice`} className={labelClass}>
              Selling price (optional)
            </label>
            <input
              type="number"
              id={`${uid}-sellingPrice`}
              name="sellingPrice"
              placeholder="61000"
              className={inputClass}
            />
          </div>
        </div>

        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px] text-fg-secondary pointer-coarse:min-h-11">
          <input
            type="checkbox"
            name="onePay"
            checked={onePay}
            onChange={(e) => setOnePay(e.target.checked)}
            className="checkbox"
          />
          One-pay lease
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-payment`} className={labelClass}>
              {onePay ? "One-pay total" : "Payment"}
            </label>
            <input
              required={!onePay}
              disabled={onePay}
              type="number"
              id={`${uid}-payment`}
              name="payment"
              placeholder={onePay ? "0" : "799"}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-dueAtSigning`} className={labelClass}>
              Due at signing
            </label>
            <input
              required
              type="number"
              id={`${uid}-dueAtSigning`}
              name="dueAtSigning"
              placeholder="4999"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-term`} className={labelClass}>
              Term (months)
            </label>
            <input
              required
              type="number"
              id={`${uid}-term`}
              name="term"
              placeholder="36"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-milesPerYear`} className={labelClass}>
              Miles/year
            </label>
            <input
              required
              type="number"
              id={`${uid}-milesPerYear`}
              name="milesPerYear"
              placeholder="10000"
              className={inputClass}
            />
          </div>
        </div>

        <IncentivesEditor value={incentives} onChange={setIncentives} />

        <div>
          <label htmlFor={`${uid}-images`} className={labelClass}>
            Photo URLs (optional, one per line)
          </label>
          <textarea
            id={`${uid}-images`}
            name="images"
            placeholder={"https://example.com/photo1.jpg"}
            className={`${textareaClass} font-mono`}
          />
          <p className="field-hint">
            Leave blank to try automatically finding a matching stock photo — not guaranteed to be
            the exact year/trim/color.
          </p>
        </div>

        <div>
          <label htmlFor={`${uid}-sourceUrl`} className={labelClass}>
            Source URL (optional)
          </label>
          <input
            type="url"
            id={`${uid}-sourceUrl`}
            name="sourceUrl"
            defaultValue={defaultSourceUrl}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`${uid}-notes`} className={labelClass}>
            Notes
          </label>
          <textarea id={`${uid}-notes`} name="notes" className={textareaClass} />
        </div>

        {state.error && (
          <p role="alert" className="alert alert-danger">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="alert alert-success">
            Staged — it&apos;s now waiting for the broker to confirm in their dashboard.
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Staging..." : "Stage this car"}
        </button>
      </form>
    </div>
  );
}
