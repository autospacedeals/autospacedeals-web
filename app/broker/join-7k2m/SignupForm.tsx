"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CircleAlert, MailCheck, UserPlus } from "lucide-react";
import { signUpAction, type AuthState } from "../actions";
import EmailInput from "@/components/EmailInput";
import LegalConsent from "@/components/LegalConsent";
import { submitKeepingValues } from "@/lib/keep-form-values";

const initialState: AuthState = { error: null };

const inputClass = "input";
const selectClass = "select";
const labelClass = "field-label";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);
  const [sellerType, setSellerType] = useState("Broker");
  const isSalesperson = sellerType === "Salesperson";

  if (state.needsConfirmation) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <MailCheck size={32} className="text-success" />
        <p className="type-title">Check your email</p>
        <p className="max-w-sm text-sm text-fg-secondary">
          We sent a confirmation link to finish setting up your account. Once confirmed, come back
          and sign in.
        </p>
        <Link href="/broker/login" className="btn btn-primary mt-2">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={submitKeepingValues(formAction)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="broker-signup-seller-type" className={labelClass}>
            I am a
          </label>
          <select
            id="broker-signup-seller-type"
            name="sellerType"
            value={sellerType}
            onChange={(e) => setSellerType(e.target.value)}
            className={selectClass}
          >
            <option value="Broker">Broker</option>
            <option value="Salesperson">Dealership salesperson</option>
          </select>
        </div>
        <div>
          <label htmlFor="broker-signup-contact-name" className={labelClass}>
            Your name
          </label>
          <input
            id="broker-signup-contact-name"
            required
            name="contactName"
            placeholder="Jordan Smith"
            className={inputClass}
          />
        </div>
        {isSalesperson ? (
          <div>
            <label htmlFor="broker-signup-dealership-name" className={labelClass}>
              Dealership you work at
            </label>
            <input
              id="broker-signup-dealership-name"
              required
              name="dealershipName"
              placeholder="AutoNation Toyota Irvine"
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="broker-signup-business-name" className={labelClass}>
              Business name
            </label>
            <input
              id="broker-signup-business-name"
              required
              name="businessName"
              placeholder="Chrome Stallions"
              className={inputClass}
            />
          </div>
        )}
        <div>
          <label htmlFor="broker-signup-contact-phone" className={labelClass}>
            Contact phone
          </label>
          <input
            id="broker-signup-contact-phone"
            required
            type="tel"
            autoComplete="tel"
            name="contactPhone"
            placeholder="949-555-1234"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="broker-signup-city" className={labelClass}>
            City
          </label>
          <input id="broker-signup-city" required name="city" className={inputClass} />
        </div>
        <div>
          <label htmlFor="broker-signup-state" className={labelClass}>
            State
          </label>
          <input
            id="broker-signup-state"
            required
            name="state"
            maxLength={2}
            placeholder="CA"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="broker-signup-license" className={labelClass}>
            {isSalesperson ? "Your DMV salesperson license number" : "DMV dealer license number"}
          </label>
          <input
            id="broker-signup-license"
            required
            name="licenseNumber"
            autoComplete="off"
            maxLength={30}
            className={inputClass}
          />
          <p className="field-hint">
            {isSalesperson
              ? "We confirm you're licensed and work at this dealership before your listings go live, usually within a day."
              : "Your dealer license with the autobroker endorsement. We check it with the DMV before your listings go live, usually within a day."}
          </p>
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <label htmlFor="broker-signup-email" className={labelClass}>
          Email
        </label>
        <EmailInput id="broker-signup-email" className={inputClass} />
      </div>
      <div>
        <label htmlFor="broker-signup-password" className={labelClass}>
          Password
        </label>
        <input
          id="broker-signup-password"
          required
          type="password"
          name="password"
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
        <p className="field-hint">At least 8 characters.</p>
      </div>

      <div className="alert alert-warning text-xs leading-5">
        <CircleAlert />
        <p>
          Every listing must show the full due-at-signing amount — if tax is assumed, disclose the
          rate (e.g. &quot;based on 7.75% tax&quot;). Accounts with repeated false or misleading
          advertising will be removed.
        </p>
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
        <Link href="/broker/login" className="font-medium text-fg transition-colors hover:text-accent-fg">
          Sign in
        </Link>
      </p>
    </form>
  );
}
