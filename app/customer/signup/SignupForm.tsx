"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import { signUpAction, type AuthState } from "../actions";
import EmailInput from "@/components/EmailInput";
import LegalConsent from "@/components/LegalConsent";

const initialState: AuthState = { error: null };

const inputClass = "input";
const labelClass = "field-label";
const fileInputClass = "file-input";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const [showOptional, setShowOptional] = useState(false);

  if (state.needsConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <MailCheck size={32} className="text-success" />
        <p className="type-title">Check your email</p>
        <p className="max-w-sm text-sm text-fg-secondary">
          We sent a confirmation link to finish setting up your account. Once confirmed, come back
          and sign in.
        </p>
        <Link href="/customer/login" className="btn btn-primary mt-2">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="signup-first-name" className={labelClass}>
            First name
          </label>
          <input id="signup-first-name" required name="firstName" placeholder="Jordan" className={inputClass} />
        </div>
        <div>
          <label htmlFor="signup-last-name" className={labelClass}>
            Last name
          </label>
          <input id="signup-last-name" required name="lastName" placeholder="Smith" className={inputClass} />
        </div>
        <div>
          <label htmlFor="signup-zip-code" className={labelClass}>
            Zip code
          </label>
          <input
            id="signup-zip-code"
            required
            name="zipCode"
            inputMode="numeric"
            maxLength={5}
            placeholder="90210"
            className={inputClass}
          />
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <label htmlFor="signup-email" className={labelClass}>
          Email
        </label>
        <EmailInput id="signup-email" className={inputClass} />
      </div>
      <div>
        <label htmlFor="signup-phone" className={labelClass}>
          Phone
        </label>
        <input
          id="signup-phone"
          required
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="949-555-1234"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="signup-password" className={labelClass}>
          Password
        </label>
        <input
          id="signup-password"
          required
          type="password"
          name="password"
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="field-hint">At least 8 characters.</p>
      </div>

      <div className="border-t border-line pt-2">
        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          aria-expanded={showOptional}
          className="flex min-h-11 w-full items-center justify-between text-sm font-medium text-fg-secondary transition-colors hover:text-fg"
        >
          <span>Additional info (optional)</span>
          {showOptional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <p className="field-hint">
          Adding these now can speed things up when you&apos;re ready to sign — you can always add or
          update them later from your dashboard.
        </p>

        {showOptional && (
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor="signup-address" className={labelClass}>
                Address
              </label>
              <input
                id="signup-address"
                name="address"
                placeholder="123 Main St, Los Angeles, CA"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="signup-current-vehicle" className={labelClass}>
                Current vehicle
              </label>
              <input
                id="signup-current-vehicle"
                name="currentVehicle"
                placeholder="2023 Honda Accord, lease ends March 2027"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="signup-drivers-license" className={labelClass}>
                Driver&apos;s license (photo)
              </label>
              <input
                id="signup-drivers-license"
                type="file"
                name="driversLicense"
                accept="image/*"
                className={fileInputClass}
              />
            </div>
            <div>
              <label htmlFor="signup-insurance-card" className={labelClass}>
                Insurance / AAA card (photo)
              </label>
              <input
                id="signup-insurance-card"
                type="file"
                name="insuranceCard"
                accept="image/*"
                className={fileInputClass}
              />
            </div>
            <p className="text-xs leading-5 text-fg-muted">
              These are stored privately and only used to speed up paperwork with a broker or
              dealer once you&apos;re ready to move forward on a deal.
            </p>
          </div>
        )}
      </div>

      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}

      <LegalConsent />
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        <UserPlus /> {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href="/customer/login" className="font-medium text-fg transition-colors hover:text-accent-fg">
          Sign in
        </Link>
      </p>
    </form>
  );
}
