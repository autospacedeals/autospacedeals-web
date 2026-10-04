"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { adminSignInAction, type AdminLoginState } from "./actions";
import { submitKeepingValues } from "@/lib/keep-form-values";

const initialState: AdminLoginState = { error: null };

export default function AdminLoginForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(adminSignInAction, initialState);
  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="admin-email" className="field-label">
          Email
        </label>
        <input id="admin-email" required type="email" name="email" autoComplete="email" className="input" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="admin-password" className="field-label">
            Password
          </label>
          <Link href="/customer/forgot-password" className="link-quiet mb-1.5 text-[13px] font-medium">
            Forgot password?
          </Link>
        </div>
        <input id="admin-password" required type="password" name="password" autoComplete="current-password" className="input" />
      </div>
      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        <LogIn /> {pending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
