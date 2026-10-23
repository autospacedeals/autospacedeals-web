import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { createClient } from "@/lib/supabase/server";
import { accountHome } from "@/lib/account-home";
import Wordmark from "@/components/Wordmark";

export const metadata: Metadata = {
  title: "Broker/Dealer Login",
  description: "Sign in to your Drive broker or dealer account.",
  // Reached only by direct link, never from search.
  robots: { index: false, follow: false },
};

export default async function BrokerLoginPage() {
  // Already signed in — skip straight to the dashboard instead of showing
  // a login form again.
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
      <div className="mx-auto w-full max-w-md">
        <div className="panel border-rule-ink p-8 sm:p-10">
          <Wordmark className="text-xl text-fg" />
          <p className="label mt-6">Dealer &amp; broker portal</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Manage your listings and submit new inventory sources.
          </p>
          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
