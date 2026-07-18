"use client";

import { useActionState } from "react";
import Link from "next/link";
import { MailCheck, UserPlus } from "lucide-react";
import { signUpAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  if (state.needsConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <MailCheck size={32} className="text-emerald-400" />
        <p className="text-lg font-bold">Check your email</p>
        <p className="max-w-sm text-sm text-zinc-400">
          We sent a confirmation link to finish setting up your account. Once confirmed, come back
          and sign in.
        </p>
        <Link
          href="/broker/login"
          className="mt-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>I am a</label>
          <select name="sellerType" defaultValue="Broker" className={inputClass}>
            <option value="Broker">Broker</option>
            <option value="Dealer">Dealer</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Your name</label>
          <input required name="contactName" placeholder="Jordan Smith" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Business name</label>
          <input required name="businessName" placeholder="Chrome Stallions" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contact phone</label>
          <input required name="contactPhone" placeholder="949-555-1234" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input required name="city" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>State</label>
          <input required name="state" maxLength={2} placeholder="CA" className={inputClass} />
        </div>
      </div>

      <div className="border-t border-white/10 pt-4">
        <label className={labelClass}>Email</label>
        <input required type="email" name="email" autoComplete="email" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Password</label>
        <input
          required
          type="password"
          name="password"
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-600">At least 8 characters.</p>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
      >
        <UserPlus size={16} /> {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/broker/login" className="font-semibold text-white hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
