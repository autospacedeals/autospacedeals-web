import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";
import Wordmark from "@/components/Wordmark";

export const metadata: Metadata = {
  title: "Set a New Password",
  // Crawlable (so Google sees this) but kept out of search results.
  robots: { index: false, follow: true },
};

export default async function ResetPasswordPage() {
  // Only reachable with a session — either already signed in, or just
  // arrived via the /auth/callback exchange from the reset email link.
  // No session means the link was invalid or expired.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/customer/forgot-password");

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <div className="panel border-rule-ink p-8 sm:p-10">
          <Wordmark className="text-xl text-fg" />
          <p className="label mt-6">Your account</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Set a new password</h1>
          <p className="mt-2 text-sm text-fg-muted">Choose a new password for your account.</p>
          <div className="mt-8">
            <ResetPasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
