import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import LoginForm from "./LoginForm";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Broker/Dealer Login",
  description: "Sign in to your AutoSpace Deals broker or dealer account.",
};

export default async function BrokerLoginPage() {
  // Already signed in — skip straight to the dashboard instead of showing
  // a login form again.
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
      <h1 className="text-3xl font-black">Sign in</h1>
      <p className="mt-2 text-zinc-400">
        Manage your listings and submit new inventory sources.
      </p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <LoginForm />
      </div>
    </main>
  );
}
