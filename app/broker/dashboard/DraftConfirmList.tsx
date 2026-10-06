"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CheckSquare, Square, Pencil, X, Trash2, Loader2, Eye } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency, msrpEditValue } from "@/lib/deal-utils";
import { PLACEHOLDER_IMAGE } from "@/lib/supabase/deals";
import { confirmDraftsAction, updateDraftDealAction, deleteDraftAction } from "./actions";
import { needsTotalPrice } from "@/lib/cars-act";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";
import LocationFields from "./LocationFields";
import MileageOptionsEditor, { toMileageRows, type MileageRow } from "./MileageOptionsEditor";
import LeaseOptionsEditor, { toLeaseOptionRows, type LeaseOptionRow } from "./LeaseOptionsEditor";

const inputClass = "input input-sm";
const labelClass = "field-label";
const selectClass = "select input-sm";
const textareaClass = "textarea input-sm";

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];
const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];

export default function DraftConfirmList({
  drafts,
}: {
  drafts: Deal[];
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(drafts.map((d) => d.id)));
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (drafts.length === 0) return null;
  const selectedCount = drafts.filter((d) => checked.has(d.id)).length;

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
    setConfirmError(null);
    const fd = new FormData();
    drafts.forEach((d) => fd.append("draftId", d.id));
    drafts.filter((d) => checked.has(d.id)).forEach((d) => fd.append("keep", d.id));
    const result = await confirmDraftsAction(fd);
    if (result?.error) setConfirmError(result.error);
    setConfirming(false);
  }

  return (
    <div className="panel border-warning/25 sm:p-8">
      <h2 className="type-title">Cars ready for your confirmation</h2>
      <p className="mt-1 text-sm text-fg-secondary">
        We pulled these from a source you submitted. Hit &quot;Edit&quot; to fill in anything
        missing or fix something we got wrong, uncheck anything that&apos;s sold or outdated, then
        confirm to publish the rest.
      </p>

      <div className="mt-5 space-y-2">
        {drafts.map((deal) => (
          <DraftRow
            key={deal.id}
            deal={deal}
            checked={checked.has(deal.id)}
            onToggle={() => toggle(deal.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={confirming}
        className="btn btn-primary mt-4"
      >
        {confirming ? "Publishing..." : `Confirm & publish selected (${selectedCount})`}
      </button>
      {confirmError && (
        <p role="alert" className="alert alert-danger mt-3">
          {confirmError}
        </p>
      )}
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
  const [deleting, setDeleting] = useState(false);
  const [onePay, setOnePay] = useState(deal.onePay);
  const [incentives, setIncentives] = useState<IncentiveRow[]>(
    (deal.incentives ?? []).map((inc) => ({ ...inc, includedInPrice: inc.includedInPrice === true }))
  );
  const [mileageRows, setMileageRows] = useState<MileageRow[]>(() => toMileageRows(deal.mileageOptions));
  const [leaseRows, setLeaseRows] = useState<LeaseOptionRow[]>(() => toLeaseOptionRows(deal.leaseOptions));
  const uid = useId();

  async function handleDelete() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Discard this draft (${dealTitle(deal)})? This can't be undone.`)
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteDraftAction(deal.id);
      if (result?.error) setError(result.error);
    } catch {
      setError("Couldn't delete — try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-canvas/60 p-3.5">
        <button
          type="button"
          onClick={onToggle}
          className="btn btn-ghost btn-icon btn-sm -ml-1.5 [&_svg]:size-5"
          aria-label="Toggle selected"
          aria-pressed={checked}
        >
          {checked ? <CheckSquare className="text-accent-fg" /> : <Square className="text-fg-muted" />}
        </button>
        <div className="min-w-0 grow basis-48">
          <p className="truncate font-semibold text-fg">{dealTitle(deal)}</p>
          <p className="text-xs text-fg-muted">
            {deal.onePay ? `${formatCurrency(deal.dueAtSigning)} one-pay` : `${formatCurrency(deal.payment)}/mo`}
            {" · "}
            {formatCurrency(deal.dueAtSigning)} due at signing · {deal.term}mo
          </p>
          {needsTotalPrice(deal.sellerType) && deal.sellingPrice == null && (
            <p className="mt-1 text-xs text-warning">Needs a total price before it can go live (CARS Act) — use Edit.</p>
          )}
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href={`/broker/preview/${deal.id}`}
            target="_blank"
            className="btn btn-secondary btn-sm"
          >
            <Eye /> View card
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-secondary btn-sm"
          >
            <Pencil /> Edit
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Discard draft"
            className="btn btn-danger btn-icon btn-sm"
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line-strong bg-hover p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-fg">{dealTitle(deal)}</p>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn btn-ghost btn-icon btn-sm -my-1 -mr-2"
          aria-label="Close"
        >
          <X />
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
            <label htmlFor={`${uid}-year`} className={labelClass}>Year</label>
            <input required type="number" id={`${uid}-year`} name="year" defaultValue={deal.year} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`${uid}-make`} className={labelClass}>Make</label>
            <input required type="text" id={`${uid}-make`} name="make" defaultValue={deal.make} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`${uid}-model`} className={labelClass}>Model</label>
            <input required type="text" id={`${uid}-model`} name="model" defaultValue={deal.model} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`${uid}-trim`} className={labelClass}>Trim (optional)</label>
            <input type="text" id={`${uid}-trim`} name="trim" defaultValue={deal.trim} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor={`${uid}-condition`} className={labelClass}>Condition</label>
            <select id={`${uid}-condition`} name="condition" defaultValue={deal.condition ?? "New"} className={selectClass}>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-bodyStyle`} className={labelClass}>Body style (optional)</label>
            <select id={`${uid}-bodyStyle`} name="bodyStyle" defaultValue={deal.bodyStyle ?? ""} className={selectClass}>
              <option value="">Not specified</option>
              {BODY_STYLES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-fuel`} className={labelClass}>Fuel type (optional)</label>
            <select id={`${uid}-fuel`} name="fuel" defaultValue={deal.fuel ?? ""} className={selectClass}>
              <option value="">Not specified</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-exterior`} className={labelClass}>Exterior color (optional)</label>
            <input type="text" id={`${uid}-exterior`} name="exterior" defaultValue={deal.exterior} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`${uid}-interior`} className={labelClass}>Interior color (optional)</label>
            <input type="text" id={`${uid}-interior`} name="interior" defaultValue={deal.interior} className={inputClass} />
          </div>
        </div>

        <input type="hidden" name="dealType" value={deal.dealType} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-msrp`} className={labelClass}>MSRP</label>
            <input
              required
              type="text"
              inputMode="numeric"
              id={`${uid}-msrp`}
              name="msrp"
              defaultValue={msrpEditValue(deal)}
              className={inputClass}
            />
            <p className="field-hint">
              Type x&apos;s for any digits to hide from shoppers (e.g. 54,xxx) — the exact number
              won&apos;t be saved.
            </p>
          </div>
          <div>
            <label htmlFor={`${uid}-sellingPrice`} className={labelClass}>Total price</label>
            <input type="number" id={`${uid}-sellingPrice`} name="sellingPrice" defaultValue={deal.sellingPrice ?? ""} className={inputClass} />
            <p className="field-hint">Before taxes and government fees. Required for dealership listings (California CARS Act); recommended for brokers.</p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg-secondary">
          <input
            type="checkbox"
            name="onePay"
            checked={onePay}
            onChange={(e) => setOnePay(e.target.checked)}
            className="checkbox"
          />
          One-pay lease (single upfront lump sum, no monthly bill)
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-payment`} className={labelClass}>{onePay ? "One-pay total" : "Monthly payment"}</label>
            <input
              required={!onePay}
              disabled={onePay}
              type="number"
              id={`${uid}-payment`}
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
                className={`${inputClass} mt-1.5`}
              />
            )}
          </div>
          <div>
            <label htmlFor={`${uid}-dueAtSigning`} className={labelClass}>{onePay ? "One-pay amount" : "Due at signing"}</label>
            <input required type="number" id={`${uid}-dueAtSigning`} name="dueAtSigning" defaultValue={deal.dueAtSigning} className={inputClass} />
            <input
              type="number"
              step="0.01"
              name="dueAtSigningTaxRate"
              defaultValue={deal.dueAtSigningTaxRate ?? ""}
              placeholder="Assumed tax % (optional)"
              className={`${inputClass} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-term`} className={labelClass}>Term (months)</label>
            <input required type="number" id={`${uid}-term`} name="term" defaultValue={deal.term} className={inputClass} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-milesPerYear`} className={labelClass}>Miles per year</label>
            <input
              required
              type="number"
              id={`${uid}-milesPerYear`}
              name="milesPerYear"
              defaultValue={deal.milesPerYear ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-brokerFee`} className={labelClass}>Broker fee (optional)</label>
            <input
              type="number"
              step="0.01"
              id={`${uid}-brokerFee`}
              name="brokerFee"
              defaultValue={deal.brokerFee ?? ""}
              placeholder="595"
              className={inputClass}
            />
            <p className="field-hint">
              Shown to shoppers as its own line item, separate from due at signing.
            </p>
          </div>
          <div>
            <label htmlFor={`${uid}-msdCount`} className={labelClass}>MSDs (optional)</label>
            <input
              type="number"
              min={1}
              max={20}
              step="1"
              id={`${uid}-msdCount`}
              name="msdCount"
              defaultValue={deal.msdCount ?? ""}
              placeholder="7"
              className={inputClass}
            />
            <p className="field-hint">How many multiple security deposits the payment assumes.</p>
          </div>
          <div>
            <label htmlFor={`${uid}-msdTotal`} className={labelClass}>MSD total (optional)</label>
            <input
              type="number"
              step="1"
              id={`${uid}-msdTotal`}
              name="msdTotal"
              defaultValue={deal.msdTotal ?? ""}
              placeholder="6300"
              className={inputClass}
            />
            <p className="field-hint">Refundable, paid at signing on top of due at signing.</p>
          </div>
        </div>

        <LocationFields
          idPrefix={uid}
          value={{ city: deal.city ?? "", state: deal.state ?? "", delivery: deal.delivery ?? "" }}
        />

        <IncentivesEditor value={incentives} onChange={setIncentives} />

        <MileageOptionsEditor value={mileageRows} onChange={setMileageRows} />

        <LeaseOptionsEditor value={leaseRows} onChange={setLeaseRows} />

        <div>
          <label htmlFor={`${uid}-images`} className={labelClass}>Photo URLs (one per line, optional)</label>
          <textarea
            id={`${uid}-images`}
            name="images"
            defaultValue={deal.images.filter((i) => i !== PLACEHOLDER_IMAGE).join("\n")}
            placeholder="https://example.com/photo1.jpg"
            className={`${textareaClass} min-h-16 resize-y font-mono`}
          />
          <p className="field-hint">
            Leave blank and we&apos;ll try to automatically find a matching stock photo, but we
            can&apos;t guarantee it&apos;ll be the exact year/trim/color.
          </p>
        </div>

        <div>
          <label htmlFor={`${uid}-notes`} className={labelClass}>Notes</label>
          <textarea id={`${uid}-notes`} name="notes" defaultValue={deal.notes} className={`${textareaClass} min-h-16 resize-y`} />
        </div>

        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-sm">
          Save changes
        </button>
      </form>
    </div>
  );
}
