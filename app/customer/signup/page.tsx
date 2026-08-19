import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import SignupForm from "./SignupForm";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Create Your Account",
  description: "Sign up to save deals, get matched with brokers, and track your search on Drive.",
};

export default async function CustomerSignupPage() {
  // Someone already signed in doesn't need the signup form — send them
  // straight to where they'd actually do something.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    if (isAdminEmail(user.email)) redirect("/admin/submissions");
    const { data: broker } = await supabase
      .from("brokers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    redirect(broker ? "/broker/dashboard" : "/customer/dashboard");
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-zinc-400">
        <UserCircle2 size={16} /> Customer Account
      </div>
      <h1 className="text-3xl font-black">Create your account</h1>
      <p className="mt-2 text-zinc-400">
        Save deals, get matched with brokers, and pick up your search right where you left off.
      </p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <SignupForm />
      </div>
    </main>
  );
}
