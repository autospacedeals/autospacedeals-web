"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { signInAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className={labelClass}>Email</label>
        <input required type="email" name="email" autoComplete="email" className={inputClass} />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className={labelClass}>Password</label>
          <Link
            href="/customer/forgot-password"
            className="mb-1.5 text-xs font-semibold text-zinc-500 hover:text-white"
          >
            Forgot password?
          </Link>
        </div>
        <input
          required
          type="password"
          name="password"
          autoComplete="current-password"
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
        <LogIn size={16} /> {pending ? "Signing in..." : "Sign in"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        New here?{" "}
        <Link href="/customer/signup" className="font-semibold text-white hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
