"use client";

import { useActionState } from "react";
import { checkSheetAction } from "./actions";

export default function CheckSheet() {
  const [state, action, pending] = useActionState(checkSheetAction, { error: null });
  return (
    <form action={action} className="panel mt-6 space-y-3">
      <p className="text-sm font-medium text-fg">Check a sheet link</p>
      <p className="text-xs text-fg-muted">See whether the site can read a broker&apos;s sheet, and what tabs it finds.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="url" type="url" required placeholder="https://docs.google.com/spreadsheets/..." className="input min-w-0 flex-1" />
        <button type="submit" disabled={pending} className="btn btn-secondary shrink-0">
          {pending ? "Checking…" : "Check"}
        </button>
      </div>
      {state.error && <p className="alert alert-danger">{state.error}</p>}
      {state.tabs && (
        <ul className="space-y-1 text-sm text-fg-secondary">
          {state.tabs.map((t) => (
            <li key={t.name}>
              <span className="font-medium text-fg">{t.name}</span> — {t.rows} row{t.rows === 1 ? "" : "s"}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
