"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { resetPasswordAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass}>New password</label>
        <input
          required
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Confirm password</label>
        <input
          required
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          className={inputClass}
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        <KeyRound size={16} /> {pending ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}
