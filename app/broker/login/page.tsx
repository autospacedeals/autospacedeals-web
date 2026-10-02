import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { createClient } from "@/lib/supabase/server";
import { accountHome } from "@/lib/account-home";
import { LogoMark } from "@/components/Logo";

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
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(47_123_255/0.14),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
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
