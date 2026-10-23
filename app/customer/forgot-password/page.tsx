import type { Metadata } from "next";
import ForgotPasswordForm from "./ForgotPasswordForm";
import Wordmark from "@/components/Wordmark";

export const metadata: Metadata = {
  title: "Reset Your Password",
  description: "Get a link to reset your Drive account password.",
  // Crawlable (so Google sees this) but kept out of search results.
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <div className="panel border-rule-ink p-8 sm:p-10">
          <Wordmark className="text-xl text-fg" />
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
