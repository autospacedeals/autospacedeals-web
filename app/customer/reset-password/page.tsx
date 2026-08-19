import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a New Password",
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
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-zinc-400">
        <UserCircle2 size={16} /> Customer Account
      </div>
      <h1 className="text-3xl font-black">Set a new password</h1>
      <p className="mt-2 text-zinc-400">Choose a new password for your account.</p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <ResetPasswordForm />
      </div>
    </main>
  );
}
