"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { signInAction, type AuthState } from "../actions";
import { submitKeepingValues } from "@/lib/keep-form-values";

const initialState: AuthState = { error: null };

const inputClass = "input";
const labelClass = "field-label";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="space-y-5">
      <div>
        <label htmlFor="broker-login-email" className={labelClass}>
          Email
        </label>
        <input
          id="broker-login-email"
          required
          type="email"
          name="email"
          autoComplete="email"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="broker-login-password" className={labelClass}>
          Password
        </label>
        <input
          id="broker-login-password"
          required
          type="password"
          name="password"
          autoComplete="current-password"
          className={inputClass}
        />
      </div>

      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        <LogIn /> {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-sm text-fg-muted">
        Need a dealer or broker account?{" "}
        <Link href="/contact" className="font-medium text-fg transition-colors hover:text-accent-fg">
          Contact us
        </Link>
      </p>
    </form>
  );
}
