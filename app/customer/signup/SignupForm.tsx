"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import { signUpAction, type AuthState } from "../actions";

const initialState: AuthState = { error: null };

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-zinc-300";
const fileInputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/20";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const [showOptional, setShowOptional] = useState(false);

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
          href="/customer/login"
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
          <label className={labelClass}>First name</label>
          <input required name="firstName" placeholder="Jordan" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Last name</label>
          <input required name="lastName" placeholder="Smith" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Zip code</label>
          <input
            required
            name="zipCode"
            inputMode="numeric"
            maxLength={5}
            placeholder="90210"
            className={inputClass}
          />
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

      <div className="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-zinc-300 transition hover:text-white"
        >
          <span>Additional info (optional)</span>
          {showOptional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <p className="mt-1 text-xs text-zinc-600">
          Adding these now can speed things up when you're ready to sign — you can always add or
          update them later from your dashboard.
        </p>

        {showOptional && (
          <div className="mt-4 space-y-4">
            <div>
              <label className={labelClass}>Address</label>
              <input name="address" placeholder="123 Main St, Los Angeles, CA" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Current vehicle</label>
              <input
                name="currentVehicle"
                placeholder="2023 Honda Accord, lease ends March 2027"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Driver&apos;s license (photo)</label>
              <input type="file" name="driversLicense" accept="image/*" className={fileInputClass} />
            </div>
            <div>
              <label className={labelClass}>Insurance / AAA card (photo)</label>
              <input type="file" name="insuranceCard" accept="image/*" className={fileInputClass} />
            </div>
            <p className="text-xs text-zinc-600">
              These are stored privately and only used to speed up paperwork with a broker or
              dealer once you're ready to move forward on a deal.
            </p>
          </div>
        )}
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
        <Link href="/customer/login" className="font-semibold text-white hover:underline">
          Sign in
        </Link>
      </p>
      <p className="text-center text-xs text-zinc-600">
        Listing deals instead?{" "}
        <Link href="/broker/signup" className="font-semibold text-zinc-400 hover:underline">
          Create a broker/dealer account
        </Link>
      </p>
    </form>
  );
}
