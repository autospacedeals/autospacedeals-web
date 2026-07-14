"use client";

import { useActionState, useState } from "react";
import { Link as LinkIcon, Sheet, FileSpreadsheet, Upload } from "lucide-react";
import { createSubmissionAction, type SubmissionState } from "./actions";

const initialState: SubmissionState = { error: null };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";

const SOURCE_TYPES = [
  { value: "link", label: "Forum post / website", icon: LinkIcon },
  { value: "google_sheet", label: "Google Sheet", icon: Sheet },
  { value: "excel_file", label: "Upload Excel file", icon: FileSpreadsheet },
] as const;

export default function NewSubmissionForm() {
  const [state, formAction, pending] = useActionState(createSubmissionAction, initialState);
  const [sourceType, setSourceType] = useState<"link" | "google_sheet" | "excel_file">("link");

  return (
    <form action={formAction} className="space-y-4" key={state.success ? "reset" : "form"}>
      <div>
        <label className={labelClass}>Source type</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {SOURCE_TYPES.map(({ value, label, icon: Icon }) => (
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
            <p className="mt-1 text-xs text-zinc-600">
              Set sharing to &quot;Anyone with the link can view&quot; so we can read it.
            </p>
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
      {state.success && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Submitted — we&apos;ll review it and reach out if we need anything else.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        <Upload size={16} /> {pending ? "Submitting..." : "Submit for review"}
      </button>
    </form>
  );
}
