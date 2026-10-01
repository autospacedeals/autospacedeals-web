"use client";

// "Continue with Google" for customer login/signup (Supabase OAuth). Hidden
// until NEXT_PUBLIC_GOOGLE_SIGN_IN is "true" — the Google provider has to
// be set up in Google Cloud and Supabase first (see TOOLS-AND-SERVICES.md),
// otherwise the button would only lead to a Supabase error page.
//
// After Google, /auth/callback signs the person in and, if they don't have
// a customer profile yet, sends them to /customer/complete-profile to add
// the zip code Google doesn't provide.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const GOOGLE_SIGN_IN_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "true";

export default function GoogleSignInButton({ next }: { next?: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!GOOGLE_SIGN_IN_ENABLED) return null;

  async function signIn() {
    setPending(true);
    setError(null);
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    // On success the browser is already on its way to Google.
    if (oauthError) {
      console.error("Google sign-in failed to start:", oauthError.message);
      setError("Couldn't start Google sign-in — please try again, or use your email below.");
      setPending(false);
    }
  }

  return (
    <div className="mb-6">
      <button type="button" onClick={signIn} disabled={pending} className="btn btn-secondary btn-lg w-full">
        <GoogleMark />
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="alert alert-danger mt-3">
          {error}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3 text-xs text-fg-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or use your email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

// Google's "G" — its brand colors are part of the mark, so they're used as-is.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
