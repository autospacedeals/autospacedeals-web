"use client";

import { useActionState, useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";
import { addAdminAction, removeAdminAction, type AdminChangeState } from "./actions";

const initialState: AdminChangeState = { error: null };

export default function AdminsManager({
  admins,
  myEmail,
}: {
  admins: { email: string; addedBy: string | null; addedAt: string | null; owner: boolean }[];
  myEmail: string;
}) {
  const [state, formAction, adding] = useActionState(addAdminAction, initialState);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  return (
    <div className="space-y-8">
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {admins.map((a) => (
          <li key={a.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span>
              <span className="font-medium text-fg">{a.email}</span>
              {a.email === myEmail && <span className="ml-2 pill pill-neutral">You</span>}
              {a.owner && <span className="ml-2 pill pill-neutral">Owner</span>}
              {a.addedBy && (
                <span className="block text-xs text-fg-muted">
                  Added by {a.addedBy}
                  {a.addedAt ? ` · ${new Date(a.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </span>
              )}
            </span>
            {!a.owner && a.email !== myEmail && (
              <button
                type="button"
                disabled={removing}
                onClick={() => {
                  if (!window.confirm(`Remove ${a.email} as an admin? Their account stays, they just lose admin access.`)) return;
                  setRemoveError(null);
                  startRemove(async () => {
                    const r = await removeAdminAction(a.email);
                    if (r.error) setRemoveError(r.error);
                  });
                }}
                className="btn btn-ghost btn-sm text-fg-muted hover:text-danger"
              >
                <X /> Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {removeError && <p className="field-error">{removeError}</p>}

      <form action={formAction} className="panel max-w-lg">
        <label htmlFor="new-admin-email" className="field-label">
          Add an admin
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="new-admin-email"
            name="email"
            type="email"
            required
            placeholder="name@adrive.com"
            className="input min-w-0 flex-1"
          />
          <button type="submit" disabled={adding} className="btn btn-primary">
            <UserPlus /> {adding ? "Adding…" : "Add admin"}
          </button>
        </div>
        <p className="field-hint">
          They get full admin access right away, plus an email with a link to set their password and sign in at
          idriveus.com/admin/login.
        </p>
        <div role="status">
          {state.error && <p className="alert alert-danger mt-3">{state.error}</p>}
          {state.notice && <p className="alert alert-success mt-3">{state.notice}</p>}
        </div>
      </form>
    </div>
  );
}
