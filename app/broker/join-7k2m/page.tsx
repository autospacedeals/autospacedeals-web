import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "./SignupForm";
import { createClient } from "@/lib/supabase/server";
import { accountHome } from "@/lib/account-home";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Create a Broker/Dealer Account",
  description: "Sign up to manage your listings on Drive.",
  // Reached only by direct link, never from search.
  robots: { index: false, follow: false },
};

// Broker signup lives at a less guessable address than /broker/signup and
// isn't linked from the consumer site — brokers get the link directly.
export default async function BrokerSignupPage() {
  // Someone already signed in (broker or admin) doesn't need the signup
  // form — send them straight to where they'd actually do something.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // A shopper account goes to its own dashboard, not the broker one.
    redirect(await accountHome(supabase, user));
  }

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(47_123_255/0.14),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
          <p className="label mt-6">Dealer &amp; broker portal</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Create your account</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Get a dashboard to list your inventory — add cars directly, or bring them in from a
            Google Sheet, a spreadsheet, pasted text, or a screenshot.
          </p>
          <div className="mt-8">
            <SignupForm />
          </div>
        </div>
      </div>
    </main>
  );
}
