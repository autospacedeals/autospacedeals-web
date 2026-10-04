"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, CheckCircle2 } from "lucide-react";
import { requestPasswordResetAction, type ResetRequestState } from "../actions";
import { submitKeepingValues } from "@/lib/keep-form-values";

const initialState: ResetRequestState = { error: null };

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  if (state.sent) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto text-success" size={32} />
        <p className="mt-3 text-sm text-fg-secondary">
          If that email matches an account, a reset link is on its way. Check your inbox.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="space-y-5">
      <div>
        <label htmlFor="forgot-email" className="field-label">
          Email
        </label>
        <input id="forgot-email" required type="email" name="email" autoComplete="email" className="input" />
      </div>

      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        <Mail /> {pending ? "Sending..." : "Send reset link"}
      </button>

      <p className="text-center text-sm text-fg-muted">
        <Link href="/customer/login" className="font-medium text-fg transition-colors hover:text-accent-fg">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
