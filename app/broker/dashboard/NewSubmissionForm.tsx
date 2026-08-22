"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Link as LinkIcon,
  Sheet,
  FileSpreadsheet,
  Upload,
  Car,
  Link2,
  PenLine,
  ImageUp,
} from "lucide-react";
import {
  createSubmissionAction,
  createManualDealAction,
  type SubmissionState,
} from "./actions";
import type { ParsedDeal } from "@/lib/parse-inventory";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";

const initialState: SubmissionState = { error: null };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";
const selectClass = inputClass + " appearance-none";

const CATEGORIES = [
  {
    value: "manual",
    label: "Add a car manually",
    description: "Fill in one vehicle's details — publishes right away",
    icon: Car,
  },
  {
    value: "link",
    label: "Link your inventory",
    description: "Forum post, website, Google Sheet, or a file — we'll pull the cars for you to review and confirm before they go live",
    icon: Link2,
  },
] as const;

const LINK_TYPES = [
  { value: "link", label: "Forum post / website", icon: LinkIcon },
  { value: "google_sheet", label: "Google Sheet", icon: Sheet },
  { value: "excel_file", label: "Upload Excel file", icon: FileSpreadsheet },
  { value: "free_text", label: "Type it up", icon: PenLine },
  { value: "screenshot", label: "Upload a screenshot", icon: ImageUp },
] as const;

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];
const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];

export default function NewSubmissionForm() {
  const [category, setCategory] = useState<"manual" | "link" | null>(null);
  // Bumped to force-remount LinkForm when a broker wants to try the same
  // (or a different) source again after some rows came back unreadable —
  // useActionState's success state otherwise sticks around forever with no
  // way back to the upload picker short of a full page reload.
  const [linkFormKey, setLinkFormKey] = useState(0);

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>What are you submitting?</label>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map(({ value, label, description, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                category === value
                  ? "border-white bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <span>
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-zinc-500">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {category === "link" && (
        <LinkForm key={linkFormKey} onStartOver={() => setLinkFormKey((k) => k + 1)} />
      )}
      {category === "manual" && <ManualForm />}
    </div>
  );
}

function LinkForm({ onStartOver }: { onStartOver: () => void }) {
  const [state, formAction, pending] = useActionState(createSubmissionAction, initialState);
  const [sourceType, setSourceType] = useState<
    "link" | "google_sheet" | "excel_file" | "free_text" | "screenshot"
  >("link");
  const [keepSynced, setKeepSynced] = useState(false);

  // Jump straight to the new drafts instead of making the broker scroll up
  // to find them — the section only exists once there's at least one
  // pending draft, and the server data backing it is already fresh by the
  // time this effect runs (the action's revalidatePath resolves before
  // useActionState hands back the success state).
  useEffect(() => {
    if (state.success && (state.parsedCount ?? 0) > 0) {
      document.getElementById("pending-drafts")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [state]);

  if (state.success) {
    const parsedCount = state.parsedCount ?? 0;
    const skippedCount = state.skippedCount ?? 0;
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 sm:p-5">
        <p className="text-sm font-semibold text-emerald-300">
          {parsedCount > 0
            ? `Source saved — we pulled ${parsedCount} car${parsedCount === 1 ? "" : "s"} from it. Take a look above to review and publish them.`
            : "Source saved."}
          {skippedCount > 0 &&
            ` ${skippedCount} row${skippedCount === 1 ? "" : "s"} couldn't be read automatically — add ${skippedCount === 1 ? "it" : "those"} below.`}
        </p>
        {state.sheetSynced && (
          <p className="mt-2 text-sm text-emerald-300/80">
            This sheet is now set to check for updates automatically — manage it below under
            &quot;Synced sheets.&quot;
          </p>
        )}
        <p className="mt-2 text-sm text-zinc-400">
          {parsedCount > 0
            ? "Need to add more? You can also enter cars one at a time below."
            : "Now add the car(s) from it below — each one publishes as soon as you submit it, and you can add as many as you need."}
        </p>

        {state.skippedDeals && state.skippedDeals.length > 0 ? (
          <div className="mt-4 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3.5 py-2.5">
              <p className="text-xs text-zinc-400">
                Rather retry the source itself than fix these by hand? A re-upload sometimes reads
                a row correctly the second time.
              </p>
              <button
                type="button"
                onClick={onStartOver}
                className="shrink-0 whitespace-nowrap rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                Try uploading again
              </button>
            </div>
            {state.skippedDeals.map((partial, i) => (
              <div key={i} className="space-y-2">
                <p className="text-xs font-semibold text-amber-300/90">
                  {state.skipReasons?.[i] ?? "Couldn't fully read this row"} — everything else we
                  could read is already filled in below, just fix what&apos;s missing.
                </p>
                <ManualForm submissionId={state.submissionId} initialValues={partial} />
              </div>
            ))}
            <div className="border-t border-white/10 pt-5">
              <p className="mb-2 text-sm text-zinc-400">Add another car from this source:</p>
              <ManualForm submissionId={state.submissionId} />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <ManualForm submissionId={state.submissionId} />
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass}>Source type</label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {LINK_TYPES.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                sourceType === value
                  ? "border-white bg-white/10 text-white"
                  : "border-white/10 text-zinc-400 hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="sourceType"
                value={value}
                checked={sourceType === value}
                onChange={() => setSourceType(value)}
                className="sr-only"
              />
              <Icon size={15} /> {label}
            </label>
          ))}
        </div>
      </div>

      {sourceType === "excel_file" ? (
        <div>
          <label className={labelClass}>Excel file (.xlsx, .xls, .csv)</label>
          <input
            required
            type="file"
            name="file"
            accept=".xlsx,.xls,.csv"
            className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-zinc-200"
          />
          <p className="mt-1 text-xs text-zinc-600">Max 10MB.</p>
        </div>
      ) : sourceType === "free_text" ? (
        <div>
          <label className={labelClass}>Paste the deal details</label>
          <textarea
            required
            name="dealText"
            placeholder={
              "2026 BMW X5 xDrive40i, 36mo/10k, $799/mo, $4999 due, MSRP 68k\n\n" +
              "2025 Porsche Taycan Turbo S, 24mo/7.5k, $1,899/mo, $8k due at signing..."
            }
            className={`${inputClass} min-h-40 resize-y`}
          />
          <p className="mt-1 text-xs text-zinc-600">
            Paste in as much as you&apos;ve got — pricing, terms, colors, whatever you have. Our AI
            reads it and pulls out each car as a draft for you to review before it publishes.
          </p>
        </div>
      ) : sourceType === "screenshot" ? (
        <div>
          <label className={labelClass}>Screenshot</label>
          <input
            required
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-zinc-950 hover:file:bg-zinc-200"
          />
          <p className="mt-1 text-xs text-zinc-600">
            A screenshot of a text thread, forum post, or spreadsheet. Our AI reads it and pulls
            out each car as a draft for you to review before it publishes. Max 10MB.
          </p>
        </div>
      ) : (
        <div>
          <label className={labelClass}>
            {sourceType === "google_sheet"
              ? "Google Sheet share link"
              : "Link to your forum post or website"}
          </label>
          <input
            required
            type="url"
            name="sourceUrl"
            placeholder={
              sourceType === "google_sheet"
                ? "https://docs.google.com/spreadsheets/..."
                : "https://forum.leasehackr.com/t/..."
            }
            className={inputClass}
          />
          {sourceType === "google_sheet" && (
            <>
              <p className="mt-1 text-xs text-zinc-600">
                Set sharing to &quot;Anyone with the link can view&quot; so we can read it.
              </p>
              <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    name="keepSynced"
                    checked={keepSynced}
                    onChange={(e) => setKeepSynced(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/5"
                  />
                  <span>
                    Keep this sheet synced automatically
                    <span className="block text-xs text-zinc-500">
                      We&apos;ll check it every ~30 minutes and remove listings that disappear from
                      the sheet (recoverable from your removed list). This first check still lands
                      as drafts for you either way.
                    </span>
                  </span>
                </label>
                {keepSynced && (
                  <label className="flex cursor-pointer items-start gap-2 pl-6 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      name="autoPublish"
                      className="mt-0.5 rounded border-white/20 bg-white/5"
                    />
                    <span>
                      Auto-publish new listings found during future checks
                      <span className="block text-xs text-zinc-500">
                        Off = new rows land as drafts for you to confirm, same as today. On = new
                        rows go live immediately, no review.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div>
        <label className={labelClass}>Notes (optional)</label>
        <textarea
          name="notes"
          placeholder="Anything we should know — which sections to pull, current specials, etc."
          className={`${inputClass} min-h-24 resize-y`}
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        <Upload size={16} /> {pending ? "Importing..." : "Import cars"}
      </button>
    </form>
  );
}

function ManualForm({
  submissionId,
  initialValues,
}: {
  submissionId?: string;
  // Pre-fills whatever a parser (heuristic or AI) already managed to read
  // for a row it couldn't fully process (e.g. everything but MSRP) — see
  // SubmissionState.skippedDeals. Left undefined for a plain blank "add a
  // car" form.
  initialValues?: Partial<ParsedDeal>;
}) {
  const [state, formAction, pending] = useActionState(createManualDealAction, initialState);
  const [onePay, setOnePay] = useState(initialValues?.onePay ?? false);
  const [incentives, setIncentives] = useState<IncentiveRow[]>([]);
  // Bump the form's key on every successful publish so the fields clear —
  // needed here (unlike a one-shot form) because a broker submitting a
  // link may come back and publish several cars in a row from this same
  // form without the page reloading in between. Adjusted during render
  // (React's recommended pattern) rather than in an effect, so there's no
  // extra render pass. Skipped when this form came pre-filled from a parsed
  // row (initialValues set) — remounting would just re-show the exact same
  // pre-filled values with no way to tell they'd already been published,
  // inviting an accidental duplicate. The submit button below is disabled
  // instead once that kind of form succeeds.
  const [prevState, setPrevState] = useState(state);
  const [resetCount, setResetCount] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    if (state.success && !initialValues) {
      setResetCount((n) => n + 1);
      setIncentives([]);
    }
  }
  const publishedAndLocked = Boolean(initialValues) && state.success;

  return (
    <form action={formAction} className="space-y-4" key={resetCount}>
      {submissionId && <input type="hidden" name="submissionId" value={submissionId} />}
      <div className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Vehicle</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <label className={labelClass}>Year</label>
              <input
                required
                type="number"
                name="year"
                defaultValue={initialValues?.year}
                placeholder="2026"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Make</label>
              <input
                required
                type="text"
                name="make"
                defaultValue={initialValues?.make}
                placeholder="BMW"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Model</label>
              <input
                required
                type="text"
                name="model"
                defaultValue={initialValues?.model}
                placeholder="X5"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-1">
              <label className={labelClass}>Trim (optional)</label>
              <input
                type="text"
                name="trim"
                defaultValue={initialValues?.trim ?? undefined}
                placeholder="xDrive40i"
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className={labelClass}>Condition</label>
              <select name="condition" defaultValue="New" className={selectClass}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
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
              <label className={labelClass}>Fuel type (optional)</label>
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
              <label className={labelClass}>Exterior color (optional)</label>
              <input
                type="text"
                name="exterior"
                defaultValue={initialValues?.exterior ?? undefined}
                placeholder="Alpine White"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Interior color (optional)</label>
              <input
                type="text"
                name="interior"
                defaultValue={initialValues?.interior ?? undefined}
                placeholder="Black"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Deal terms</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>MSRP</label>
              <input
                required
                type="text"
                inputMode="numeric"
                name="msrp"
                defaultValue={initialValues?.msrp ?? undefined}
                placeholder="65000, or 65,xxx to hide part of it"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Type x&apos;s for any digits to hide from shoppers (e.g. 54,xxx) — the exact number
                won&apos;t be saved.
              </p>
            </div>
            <div>
              <label className={labelClass}>Selling price (optional)</label>
              <input type="number" name="sellingPrice" placeholder="61000" className={inputClass} />
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              name="onePay"
              checked={onePay}
              onChange={(e) => setOnePay(e.target.checked)}
              className="rounded border-white/20 bg-white/5"
            />
            This is a one-pay lease (single upfront lump sum, no monthly bill)
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>{onePay ? "One-pay total" : "Monthly payment"}</label>
              <input
                required={!onePay}
                disabled={onePay}
                type="number"
                name="payment"
                defaultValue={initialValues?.payment ?? undefined}
                placeholder={onePay ? "0 — see due at signing" : "799"}
                className={inputClass}
              />
              {!onePay && (
                <input
                  type="number"
                  step="0.01"
                  name="paymentTaxRate"
                  placeholder="If tax is included, assumed tax % (optional)"
                  className={`${inputClass} mt-1.5 text-xs`}
                />
              )}
            </div>
            <div>
              <label className={labelClass}>{onePay ? "One-pay amount" : "Due at signing"}</label>
              <input
                required
                type="number"
                name="dueAtSigning"
                defaultValue={initialValues?.dueAtSigning ?? undefined}
                placeholder={onePay ? "55999" : "4999"}
                className={inputClass}
              />
              <input
                type="number"
                step="0.01"
                name="dueAtSigningTaxRate"
                placeholder="Assumed tax % (optional)"
                className={`${inputClass} mt-1.5 text-xs`}
              />
            </div>
            <div>
              <label className={labelClass}>Term (months)</label>
              <input
                required
                type="number"
                name="term"
                defaultValue={initialValues?.term}
                placeholder="36"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Miles per year</label>
              <input
                required
                type="number"
                name="milesPerYear"
                defaultValue={initialValues?.milesPerYear ?? undefined}
                placeholder="10000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Broker fee (optional)</label>
              <input
                type="number"
                step="0.01"
                name="brokerFee"
                defaultValue={initialValues?.brokerFee ?? undefined}
                placeholder="595"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-zinc-500">
                Shown to shoppers as its own line item, separate from due at signing.
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Incentives</p>
          <IncentivesEditor value={incentives} onChange={setIncentives} />
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
            Photos (optional)
          </p>
          <label className={labelClass}>Photo URLs (one per line)</label>
          <textarea
            name="images"
            placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
            className={`${inputClass} min-h-20 resize-y font-mono text-xs`}
          />
          <p className="mt-1 text-xs text-zinc-600">
            Links to real photos of this vehicle — a manufacturer site, your own listing, etc. No
            attachments yet, just links for now. Leave this blank and we&apos;ll try to automatically
            find a matching stock photo, but we can&apos;t guarantee it&apos;ll be the exact
            year/trim/color — upload your own for the most accurate listing.
          </p>
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          name="notes"
          defaultValue={initialValues?.notes ?? undefined}
          placeholder="Any packages/features, current specials, or anything else worth knowing."
          className={`${inputClass} min-h-24 resize-y`}
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Published — this listing is live on the site now.{" "}
          {submissionId
            ? "Add another car from the same source below, or head to “Your live listings” when you're done."
            : "Manage it below anytime."}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || publishedAndLocked}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        <Upload size={16} />
        {pending ? "Publishing..." : publishedAndLocked ? "Published" : "Publish this car"}
      </button>
    </form>
  );
}
