import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Reset Your Password",
  description: "Get a link to reset your Drive account password.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(47_123_255/0.14),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
          <p className="label mt-6">Customer account</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Reset your password</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Enter the email on your account and we&apos;ll send you a link to reset it.
          </p>
          <div className="mt-8">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </main>
  );
}
