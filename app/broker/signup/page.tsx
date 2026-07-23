import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import SignupForm from "./SignupForm";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Create a Broker/Dealer Account",
  description: "Sign up to manage your listings on AutoSpace Deals.",
};

export default async function BrokerSignupPage() {
  // Someone already signed in (broker or admin) doesn't need the signup
  // form — send them straight to where they'd actually do something.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(isAdminEmail(user.email) ? "/admin/submissions" : "/broker/dashboard");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-zinc-400">
        <ShieldCheck size={16} /> Broker &amp; Dealer Portal
      </div>
      <h1 className="text-3xl font-black">Create your account</h1>
      <p className="mt-2 text-zinc-400">
        Get a dashboard to submit your inventory sources — a forum thread, your website, or a
        spreadsheet — for us to review and add to the site.
      </p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <SignupForm />
      </div>
    </main>
  );
}
