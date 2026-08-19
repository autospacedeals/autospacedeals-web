import type { Metadata } from "next";
import { UserCircle2 } from "lucide-react";
import ForgotPasswordForm from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset Your Password",
  description: "Get a link to reset your Drive account password.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-zinc-400">
        <UserCircle2 size={16} /> Customer Account
      </div>
      <h1 className="text-3xl font-black">Reset your password</h1>
      <p className="mt-2 text-zinc-400">
        Enter the email on your account and we&apos;ll send you a link to reset it.
      </p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
