"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, CheckCircle2 } from "lucide-react";
import { requestPasswordResetAction, type ResetRequestState } from "../actions";

const initialState: ResetRequestState = { error: null };

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  if (state.sent) {
    return (
      <div className="text-center">
        <CheckCircle2 className="mx-auto text-emerald-400" size={32} />
        <p className="mt-3 text-sm text-zinc-300">
          If that email matches an account, a reset link is on its way. Check your inbox.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-zinc-300">Email</label>
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
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
        <Mail size={16} /> {pending ? "Sending..." : "Send reset link"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        <Link href="/customer/login" className="font-semibold text-white hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
