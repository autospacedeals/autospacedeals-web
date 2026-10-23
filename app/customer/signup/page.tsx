import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "./SignupForm";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import Wordmark from "@/components/Wordmark";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export const metadata: Metadata = {
  title: "Create Your Account",
  description: "Sign up to save deals, get matched with brokers, and track your search on Drive.",
  // Crawlable (so Google sees this) but kept out of search results.
  robots: { index: false, follow: true },
};

export default async function CustomerSignupPage() {
  // Someone already signed in doesn't need the signup form — send them
  // straight to where they'd actually do something.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    if (await isAdminEmail(user.email)) redirect("/admin");
    const { data: broker } = await supabase
      .from("brokers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    redirect(broker ? "/broker/dashboard" : "/customer/dashboard");
  }

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <div className="panel border-rule-ink p-8 sm:p-10">
          <Wordmark className="text-xl text-fg" />
          <p className="label mt-6">Customer account</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Create your account</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Save deals, get matched with brokers, and pick up your search right where you left off.
          </p>
          <div className="mt-8">
            <GoogleSignInButton />
            <SignupForm />
          </div>
        </div>
      </div>
    </main>
  );
}
