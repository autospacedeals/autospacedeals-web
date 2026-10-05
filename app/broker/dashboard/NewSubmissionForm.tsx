"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
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
  listSheetTabsAction,
  type SubmissionState,
} from "./actions";
import type { ParsedDeal } from "@/lib/parse-inventory";
import IncentivesEditor, { type IncentiveRow } from "./IncentivesEditor";
import LocationFields from "./LocationFields";
import MileageOptionsEditor, { toMileageRows, type MileageRow } from "./MileageOptionsEditor";
import { submitKeepingValues } from "@/lib/keep-form-values";
import ConnectSheetButton from "./ConnectSheetButton";

const initialState: SubmissionState = { error: null };

function sheetIdFromUrl(url: string): string | null {
  return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? null;
}

const inputClass = "input";
const labelClass = "field-label";
const selectClass = "select";
// Subsection heading inside the manual form (Vehicle, Deal terms, …).
const sectionHeadingClass = "mb-3 text-sm font-semibold text-fg";

const CATEGORIES = [
  {
    value: "manual",
    label: "Add a car manually",
    description: "Fill in one vehicle's details — publishes right away",
    icon: Car,
  },
  {
    value: "link",
    label: "Import your inventory",
    description: "A Google Sheet, a file, pasted text, or a screenshot — we'll pull the cars for you to review and confirm before they go live",
    icon: Link2,
  },
] as const;

const LINK_TYPES = [
  { value: "google_sheet", label: "Google Sheet", icon: Sheet },
  { value: "excel_file", label: "Upload Excel file", icon: FileSpreadsheet },
  { value: "free_text", label: "Type it up", icon: PenLine },
  { value: "screenshot", label: "Upload a screenshot", icon: ImageUp },
] as const;

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];
const CONDITIONS = ["New", "Loaner", "Demo", "CPO", "Used"];

// sheetShareEmail: Drive's service-account email a broker can share a
// private Google Sheet with (null when that isn't set up).
// brokerLocation: the broker's own city/state, the default location for
// each car they add.
export default function NewSubmissionForm({
  sheetShareEmail = null,
  brokerLocation,
}: {
  sheetShareEmail?: string | null;
  brokerLocation: { city: string; state: string };
}) {
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
              aria-pressed={category === value}
              className="choice items-start px-4 py-3 text-left aria-pressed:border-accent-line aria-pressed:bg-accent-soft aria-pressed:text-fg"
            >
              <Icon className="mt-0.5 shrink-0" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-fg-muted">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {category === "link" && (
        <LinkForm
          key={linkFormKey}
          onStartOver={() => setLinkFormKey((k) => k + 1)}
          sheetShareEmail={sheetShareEmail}
          brokerLocation={brokerLocation}
        />
      )}
      {category === "manual" && <ManualForm brokerLocation={brokerLocation} />}
    </div>
  );
}

function LinkForm({
  onStartOver,
  sheetShareEmail,
  brokerLocation,
}: {
  sheetShareEmail: string | null;
  brokerLocation: { city: string; state: string };
  onStartOver: () => void;
}) {
  const [state, formAction, pending] = useActionState(createSubmissionAction, initialState);
  const [sourceType, setSourceType] = useState<
    "google_sheet" | "excel_file" | "free_text" | "screenshot"
  >("google_sheet");
  const [keepSynced, setKeepSynced] = useState(false);
  // Google Sheet step one: the sheet's tabs, and which ones to import.
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTabs, setSheetTabs] = useState<{ name: string; rows: number }[] | null>(null);
  const [pickedTabs, setPickedTabs] = useState<string[]>([]);
  const [findingTabs, setFindingTabs] = useState(false);
  const [tabsError, setTabsError] = useState<string | null>(null);
  // Private sheet not shared with us yet: offer "Connect with Google".
  const [needsConnect, setNeedsConnect] = useState(false);
  const uid = useId();

  async function findTabs() {
    setFindingTabs(true);
    setTabsError(null);
    const result = await listSheetTabsAction(sheetUrl);
    setFindingTabs(false);
    setNeedsConnect(Boolean(result.notShared && sheetShareEmail));
    if (result.error || !result.tabs) {
      // A private sheet gets the connect button instead of sharing steps.
      setTabsError(result.notShared && sheetShareEmail ? null : (result.error ?? "Couldn't read that sheet."));
      setSheetTabs(null);
      return;
    }
    setSheetTabs(result.tabs);
    setPickedTabs(result.tabs.filter((t) => t.rows > 0).map((t) => t.name));
  }

  const isSheet = sourceType === "google_sheet";
  const pickedRows = (sheetTabs ?? []).filter((t) => pickedTabs.includes(t.name)).reduce((n, t) => n + t.rows, 0);

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
      <div className="rounded-2xl border border-success/20 bg-success/5 p-4 sm:p-5">
        <p className="text-sm font-semibold text-success">
          {parsedCount > 0
            ? `Source saved — we pulled ${parsedCount} car${parsedCount === 1 ? "" : "s"} from it. Take a look above to review and publish them.`
            : "Source saved."}
          {skippedCount > 0 &&
            ` ${skippedCount} row${skippedCount === 1 ? "" : "s"} couldn't be read automatically — add ${skippedCount === 1 ? "it" : "those"} below.`}
        </p>
        {state.sheetSynced && (
          <p className="mt-2 text-sm text-success">
            This sheet is now set to check for updates automatically — manage it above under
            &quot;From your live Google Sheet.&quot;
          </p>
        )}
        <p className="mt-2 text-sm text-fg-secondary">
          {parsedCount > 0
            ? "Need to add more? You can also enter cars one at a time below."
            : "Now add the car(s) from it below — each one publishes as soon as you submit it, and you can add as many as you need."}
        </p>

        {state.skippedDeals && state.skippedDeals.length > 0 ? (
          <div className="mt-4 space-y-6">
            <div className="alert alert-warning flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <p className="text-xs leading-5 text-fg-secondary">
                Rather retry the source itself than fix these by hand? A re-upload sometimes reads
                a row correctly the second time.
              </p>
              <button type="button" onClick={onStartOver} className="btn btn-secondary btn-sm">
                Try uploading again
              </button>
            </div>
            {state.skippedDeals.map((partial, i) => (
              <div key={i} className="space-y-2">
                <p className="text-xs font-semibold text-warning">
                  {state.skipReasons?.[i] ?? "Couldn't fully read this row"} — everything else we
                  could read is already filled in below, just fix what&apos;s missing.
                </p>
                <ManualForm
                  brokerLocation={brokerLocation}
                  submissionId={state.submissionId}
                  initialValues={partial}
                />
              </div>
            ))}
            <div className="border-t border-line pt-5">
              <p className="mb-2 text-sm text-fg-secondary">Add another car from this source:</p>
              <ManualForm submissionId={state.submissionId} brokerLocation={brokerLocation} />
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <ManualForm submissionId={state.submissionId} brokerLocation={brokerLocation} />
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="space-y-4">
      <div>
        <label className={labelClass}>Source type</label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {LINK_TYPES.map(({ value, label, icon: Icon }) => (
            <label key={value} className="choice gap-2 px-3">
              <input
                type="radio"
                name="sourceType"
                value={value}
                checked={sourceType === value}
                onChange={() => setSourceType(value)}
                className="sr-only"
              />
              <Icon /> {label}
            </label>
          ))}
        </div>
      </div>

      {sourceType === "excel_file" ? (
        <div>
          <label htmlFor={`${uid}-excelFile`} className={labelClass}>Excel file (.xlsx, .xls, .csv)</label>
          <input
            required
            type="file"
            id={`${uid}-excelFile`}
            name="file"
            accept=".xlsx,.xls,.csv"
            className="file-input"
          />
          <p className="field-hint">Max 10MB.</p>
        </div>
      ) : sourceType === "free_text" ? (
        <div>
          <label htmlFor={`${uid}-dealText`} className={labelClass}>Paste the deal details</label>
          <textarea
            required
            id={`${uid}-dealText`}
            name="dealText"
            placeholder={
              "2026 BMW X5 xDrive40i, 36mo/10k, $799/mo, $4999 due, MSRP 68k\n\n" +
              "2025 Porsche Taycan Turbo S, 24mo/7.5k, $1,899/mo, $8k due at signing..."
            }
            className="textarea min-h-40 resize-y"
          />
          <p className="field-hint">
            Paste in as much as you&apos;ve got — pricing, terms, colors, whatever you have. Our AI
            reads it and pulls out each car as a draft for you to review before it publishes.
          </p>
        </div>
      ) : sourceType === "screenshot" ? (
        <div>
          <label htmlFor={`${uid}-screenshot`} className={labelClass}>Screenshot</label>
          <input
            required
            type="file"
            id={`${uid}-screenshot`}
            name="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="file-input"
          />
          <p className="field-hint">
            A screenshot of a text thread, post, or spreadsheet. Our AI reads it and pulls
            out each car as a draft for you to review before it publishes. Max 10MB.
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor={`${uid}-sourceUrl`} className={labelClass}>
            Google Sheet share link
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              required
              type="url"
              id={`${uid}-sourceUrl`}
              name="sourceUrl"
              value={sheetUrl}
              onChange={(e) => {
                setSheetUrl(e.target.value);
                setSheetTabs(null);
                setTabsError(null);
                setNeedsConnect(false);
              }}
              placeholder="https://docs.google.com/spreadsheets/..."
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={findTabs}
              disabled={findingTabs || !sheetUrl.trim()}
              className="btn btn-secondary shrink-0"
            >
              {findingTabs ? "Opening sheet…" : sheetTabs ? "Re-check tabs" : "Find tabs"}
            </button>
          </div>
          {tabsError && (
            <p role="alert" className="alert alert-danger mt-2">
              {tabsError}
            </p>
          )}
          {needsConnect && sheetShareEmail && sheetIdFromUrl(sheetUrl) && (
            <div className="mt-3 rounded-xl border border-line bg-hover p-3.5">
              <p className="text-sm font-medium text-fg">This sheet is private — connect it in one step</p>
              <p className="mt-0.5 mb-3 text-xs leading-5 text-fg-muted">
                Sign in with the Google account that owns the sheet, then select it. Google&apos;s
                standard message says we could &quot;see, edit, create, and delete&quot; the files you
                pick — we only use it once, to add view-only access to this one sheet, and then give
                the access back. Nothing else in your Google account is touched.
              </p>
              <ConnectSheetButton
                sheetId={sheetIdFromUrl(sheetUrl)!}
                readerEmail={sheetShareEmail}
                onConnected={() => {
                  setNeedsConnect(false);
                  void findTabs();
                }}
              />
            </div>
          )}
          {sheetTabs && (
            <fieldset className="mt-3 rounded-xl border border-line bg-hover p-3.5">
              <legend className="sr-only">Tabs to import</legend>
              <p className="text-sm font-medium text-fg">Which tabs should we pull cars from?</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                Uncheck outdated tabs — we only read the ones you leave checked. Hidden tabs are skipped.
              </p>
              <ul className="mt-2.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {sheetTabs.map((t) => (
                  <li key={t.name}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-fg">
                      <input
                        type="checkbox"
                        name="tabs"
                        value={t.name}
                        checked={pickedTabs.includes(t.name)}
                        onChange={(e) =>
                          setPickedTabs((prev) =>
                            e.target.checked ? [...prev, t.name] : prev.filter((n) => n !== t.name)
                          )
                        }
                        className="checkbox"
                      />
                      <span className="min-w-0 truncate">{t.name}</span>
                      <span className="shrink-0 text-xs text-fg-muted">
                        {t.rows === 0 ? "empty" : `${t.rows} row${t.rows === 1 ? "" : "s"}`}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          {sourceType === "google_sheet" && (
            <>
              {sheetShareEmail ? (
                <p className="field-hint">
                  Private sheets work too — if it&apos;s private, you&apos;ll get a one-click
                  &quot;Connect with Google&quot; button after Find tabs.
                </p>
              ) : (
                <p className="field-hint">
                  Set sharing to &quot;Anyone with the link can view&quot; so we can read it.
                </p>
              )}
              <div className="mt-3 space-y-3 rounded-xl border border-line bg-hover p-3.5">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-fg-secondary">
                  <input
                    type="checkbox"
                    name="keepSynced"
                    checked={keepSynced}
                    onChange={(e) => setKeepSynced(e.target.checked)}
                    className="checkbox mt-px"
                  />
                  <span>
                    Keep this sheet synced automatically
                    <span className="mt-0.5 block text-xs leading-5 text-fg-muted">
                      We&apos;ll check it every ~30 minutes, update changed prices, and remove cars
                      you delete or cross out on the sheet (recoverable from your removed list).
                      This first check still lands as drafts for you either way.
                    </span>
                  </span>
                </label>
                {keepSynced && (
                  <label className="flex cursor-pointer items-start gap-2.5 pl-7 text-sm text-fg-secondary">
                    <input type="checkbox" name="autoPublish" className="checkbox mt-px" />
                    <span>
                      Auto-publish new listings found during future checks
                      <span className="mt-0.5 block text-xs leading-5 text-fg-muted">
                        Off = new rows land as drafts for you to confirm. On = new
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
        <label htmlFor={`${uid}-notes`} className={labelClass}>Notes (optional)</label>
        <textarea
          id={`${uid}-notes`}
          name="notes"
          placeholder="Anything we should know — which sections to pull, current specials, etc."
          className="textarea min-h-24 resize-y"
        />
      </div>

      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || (isSheet && (!sheetTabs || pickedTabs.length === 0))}
        className="btn btn-primary"
      >
        <Upload />{" "}
        {pending
          ? "Importing..."
          : isSheet && sheetTabs
            ? `Import cars from ${pickedTabs.length} tab${pickedTabs.length === 1 ? "" : "s"}`
            : "Import cars"}
      </button>
      {isSheet && !sheetTabs && <p className="field-hint">Paste the link and click &quot;Find tabs&quot; first.</p>}
      {isSheet && pending && pickedRows > 40 && (
        <p role="status" className="field-hint">
          Reading about {pickedRows} rows — this can take a minute or two. Keep this page open.
        </p>
      )}
    </form>
  );
}

function ManualForm({
  submissionId,
  initialValues,
  brokerLocation,
}: {
  submissionId?: string;
  brokerLocation: { city: string; state: string };
  // Pre-fills whatever a parser (heuristic or AI) already managed to read
  // for a row it couldn't fully process (e.g. everything but MSRP) — see
  // SubmissionState.skippedDeals. Left undefined for a plain blank "add a
  // car" form.
  initialValues?: Partial<ParsedDeal>;
}) {
  const [state, formAction, pending] = useActionState(createManualDealAction, initialState);
  const [onePay, setOnePay] = useState(initialValues?.onePay ?? false);
  const [incentives, setIncentives] = useState<IncentiveRow[]>(initialValues?.incentives ?? []);
  const [mileageRows, setMileageRows] = useState<MileageRow[]>(toMileageRows(initialValues?.mileageOptions));
  const uid = useId();
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
      setMileageRows([]);
    }
  }
  const publishedAndLocked = Boolean(initialValues) && state.success;
  // A row the AI couldn't fully read comes pre-filled; the required fields
  // it couldn't get are highlighted (until filled in — see .field-missing
  // in globals.css) so they're easy to spot.
  const missingField = (key: keyof ParsedDeal, className = "") => {
    const absent = Boolean(initialValues) && !initialValues?.[key] && !(key === "payment" && onePay);
    return [className, absent ? "field-missing" : ""].filter(Boolean).join(" ") || undefined;
  };

  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="space-y-4" key={resetCount}>
      {submissionId && <input type="hidden" name="submissionId" value={submissionId} />}
      <div className="space-y-6 rounded-xl border border-line bg-hover p-4">
        <div>
          <p className={sectionHeadingClass}>Vehicle</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className={missingField("year", "sm:col-span-1")}>
              <label htmlFor={`${uid}-year`} className={labelClass}>Year<MissingTag /></label>
              <input
                required
                type="number"
                id={`${uid}-year`}
                name="year"
                defaultValue={initialValues?.year}
                placeholder="2026"
                className={inputClass}
              />
            </div>
            <div className={missingField("make", "sm:col-span-1")}>
              <label htmlFor={`${uid}-make`} className={labelClass}>Make<MissingTag /></label>
              <input
                required
                type="text"
                id={`${uid}-make`}
                name="make"
                defaultValue={initialValues?.make}
                placeholder="BMW"
                className={inputClass}
              />
            </div>
            <div className={missingField("model", "sm:col-span-1")}>
              <label htmlFor={`${uid}-model`} className={labelClass}>Model<MissingTag /></label>
              <input
                required
                type="text"
                id={`${uid}-model`}
                name="model"
                defaultValue={initialValues?.model}
                placeholder="X5"
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-1">
              <label htmlFor={`${uid}-trim`} className={labelClass}>Trim (optional)</label>
              <input
                type="text"
                id={`${uid}-trim`}
                name="trim"
                defaultValue={initialValues?.trim ?? undefined}
                placeholder="xDrive40i"
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor={`${uid}-condition`} className={labelClass}>Condition</label>
              <select id={`${uid}-condition`} name="condition" defaultValue="New" className={selectClass}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-bodyStyle`} className={labelClass}>Body style (optional)</label>
              <select id={`${uid}-bodyStyle`} name="bodyStyle" defaultValue="" className={selectClass}>
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
              <label htmlFor={`${uid}-exterior`} className={labelClass}>Exterior color (optional)</label>
              <input
                type="text"
                id={`${uid}-exterior`}
                name="exterior"
                defaultValue={initialValues?.exterior ?? undefined}
                placeholder="Alpine White"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-interior`} className={labelClass}>Interior color (optional)</label>
              <input
                type="text"
                id={`${uid}-interior`}
                name="interior"
                defaultValue={initialValues?.interior ?? undefined}
                placeholder="Black"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <p className={sectionHeadingClass}>Deal terms</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={missingField("msrp", "")}>
              <label htmlFor={`${uid}-msrp`} className={labelClass}>MSRP<MissingTag /></label>
              <input
                required
                type="text"
                inputMode="numeric"
                id={`${uid}-msrp`}
                name="msrp"
                defaultValue={initialValues?.msrp ?? undefined}
                placeholder="65000, or 65,xxx to hide part of it"
                className={inputClass}
              />
              <p className="field-hint">
                Type x&apos;s for any digits to hide from shoppers (e.g. 54,xxx) — the exact number
                won&apos;t be saved.
              </p>
            </div>
            <div>
              <label htmlFor={`${uid}-sellingPrice`} className={labelClass}>Selling price (optional)</label>
              <input type="number" id={`${uid}-sellingPrice`} name="sellingPrice" placeholder="61000" className={inputClass} />
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-fg-secondary">
            <input
              type="checkbox"
              name="onePay"
              checked={onePay}
              onChange={(e) => setOnePay(e.target.checked)}
              className="checkbox"
            />
            This is a one-pay lease (single upfront lump sum, no monthly bill)
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className={missingField("payment", "")}>
              <label htmlFor={`${uid}-payment`} className={labelClass}>{onePay ? "One-pay total" : "Monthly payment"}<MissingTag /></label>
              <input
                required={!onePay}
                disabled={onePay}
                type="number"
                id={`${uid}-payment`}
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
                  className={`${inputClass} mt-1.5`}
                />
              )}
            </div>
            <div className={missingField("dueAtSigning", "")}>
              <label htmlFor={`${uid}-dueAtSigning`} className={labelClass}>{onePay ? "One-pay amount" : "Due at signing"}<MissingTag /></label>
              <input
                required
                type="number"
                id={`${uid}-dueAtSigning`}
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
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div className={missingField("term", "")}>
              <label htmlFor={`${uid}-term`} className={labelClass}>Term (months)<MissingTag /></label>
              <input
                required
                type="number"
                id={`${uid}-term`}
                name="term"
                defaultValue={initialValues?.term}
                placeholder="36"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className={missingField("milesPerYear", "")}>
              <label htmlFor={`${uid}-milesPerYear`} className={labelClass}>Miles per year<MissingTag /></label>
              <input
                required
                type="number"
                id={`${uid}-milesPerYear`}
                name="milesPerYear"
                defaultValue={initialValues?.milesPerYear ?? undefined}
                placeholder="10000"
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
                defaultValue={initialValues?.brokerFee ?? undefined}
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
                defaultValue={initialValues?.msdCount ?? undefined}
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
                defaultValue={initialValues?.msdTotal ?? undefined}
                placeholder="6300"
                className={inputClass}
              />
              <p className="field-hint">Refundable, paid at signing on top of due at signing.</p>
            </div>
          </div>
        </div>

        <div>
          <p className={sectionHeadingClass}>Location</p>
          <LocationFields
            idPrefix={uid}
            value={{
              city: initialValues?.city ?? brokerLocation.city,
              state: initialValues?.state ?? brokerLocation.state,
              delivery: initialValues?.delivery ?? "",
            }}
          />
        </div>

        <div>
          <p className={sectionHeadingClass}>Incentives</p>
          <IncentivesEditor value={incentives} onChange={setIncentives} />
        </div>

        <MileageOptionsEditor value={mileageRows} onChange={setMileageRows} />

        <div>
          <p className={sectionHeadingClass}>Photos (optional)</p>
          <label htmlFor={`${uid}-images`} className={labelClass}>Photo URLs (one per line)</label>
          <textarea
            id={`${uid}-images`}
            name="images"
            placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
            className="textarea min-h-20 resize-y font-mono"
          />
          <p className="field-hint">
            Links to real photos of this vehicle — a manufacturer site, your own listing, etc. No
            attachments yet, just links for now. Leave this blank and we&apos;ll try to automatically
            find a matching stock photo, but we can&apos;t guarantee it&apos;ll be the exact
            year/trim/color — upload your own for the most accurate listing.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor={`${uid}-notes`} className={labelClass}>Notes</label>
        <textarea
          id={`${uid}-notes`}
          name="notes"
          defaultValue={initialValues?.notes ?? undefined}
          placeholder="Any packages/features, current specials, or anything else worth knowing."
          className="textarea min-h-24 resize-y"
        />
      </div>

      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="alert alert-success">
          Published — this listing is live on the site now.{" "}
          {submissionId
            ? "Add another car from the same source below, or head to “Your live listings” when you're done."
            : "Manage it below anytime."}
        </p>
      )}

      <button type="submit" disabled={pending || publishedAndLocked} className="btn btn-primary">
        <Upload />
        {pending ? "Publishing..." : publishedAndLocked ? "Published" : "Publish this car"}
      </button>
    </form>
  );
}

function MissingTag() {
  return <span className="missing-tag">Missing</span>;
}
