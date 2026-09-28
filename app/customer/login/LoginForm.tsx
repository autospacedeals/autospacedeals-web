"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { signInAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

const inputClass = "input";
const labelClass = "field-label";

export default function LoginForm({ next = null }: { next?: string | null }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {/* Re-validated on the server — this is only a hint of where to go. */}
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="login-email" className={labelClass}>
          Email
        </label>
        <input id="login-email" required type="email" name="email" autoComplete="email" className={inputClass} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="login-password" className={labelClass}>
            Password
          </label>
          <Link href="/customer/forgot-password" className="link-quiet mb-1.5 text-[13px] font-medium">
            Forgot password?
          </Link>
        </div>
        <input
          id="login-password"
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
        New here?{" "}
        <Link href="/customer/signup" className="font-medium text-fg transition-colors hover:text-accent-fg">
          Create an account
        </Link>
      </p>
    </form>
  );
}
