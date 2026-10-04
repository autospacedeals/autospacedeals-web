"use client";

import { useActionState } from "react";
import { UserCheck } from "lucide-react";
import { completeProfileAction, type AuthState } from "../actions";
import LegalConsent from "@/components/LegalConsent";

const initialState: AuthState = { error: null };

export default function CompleteProfileForm({
  firstName,
  lastName,
  next,
}: {
  firstName: string;
  lastName: string;
  next: string | null;
}) {
  const [state, formAction, pending] = useActionState(completeProfileAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="complete-first-name" className="field-label">
            First name
          </label>
          <input
            id="complete-first-name"
            name="firstName"
            required
            autoComplete="given-name"
            defaultValue={firstName}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="complete-middle-name" className="field-label">
            Middle name <span className="text-fg-faint">(optional)</span>
          </label>
          <input id="complete-middle-name" name="middleName" maxLength={80} autoComplete="additional-name" className="input" />
        </div>
        <div>
          <label htmlFor="complete-last-name" className="field-label">
            Last name
          </label>
          <input
            id="complete-last-name"
            name="lastName"
            required
            autoComplete="family-name"
            defaultValue={lastName}
            className="input"
          />
        </div>
      </div>
      <div>
        <label htmlFor="complete-zip" className="field-label">
          Zip code
        </label>
        <input
          id="complete-zip"
          name="zipCode"
          required
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          autoComplete="postal-code"
          autoFocus
          className="input"
        />
      </div>
      <div>
        <label htmlFor="complete-phone" className="field-label">
          Phone
        </label>
        <input
          id="complete-phone"
          name="phone"
          required
          type="tel"
          autoComplete="tel"
          placeholder="949-555-1234"
          className="input"
        />
      </div>

      {state.error && (
        <p role="alert" className="alert alert-danger">
          {state.error}
        </p>
      )}

      <LegalConsent action="finishing your account" />
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        <UserCheck /> {pending ? "Saving..." : "Finish"}
      </button>
    </form>
  );
}
