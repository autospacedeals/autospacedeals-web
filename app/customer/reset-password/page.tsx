import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";
import { LogoMark } from "@/components/Logo";

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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(47_123_255/0.14),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
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
