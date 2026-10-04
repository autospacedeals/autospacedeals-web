"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { resetPasswordAction, type AuthState } from "../actions";
import { submitKeepingValues } from "@/lib/keep-form-values";

const initialState: AuthState = { error: null };

const inputClass = "input";
const labelClass = "field-label";

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="space-y-5">
      <div>
        <label htmlFor="reset-password" className={labelClass}>
          New password
        </label>
        <input
          id="reset-password"
          required
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="reset-confirm-password" className={labelClass}>
          Confirm password
        </label>
        <input
          id="reset-confirm-password"
          required
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          className={inputClass}
        />
      </div>

      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        <KeyRound /> {pending ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}
