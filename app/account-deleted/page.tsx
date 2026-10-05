import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

// Where someone lands after deleting their account (app/account/actions.ts).
export default function AccountDeletedPage() {
  return (
    <main className="container-page max-w-xl py-16 sm:py-20">
      <div className="panel">
        <h1 className="type-title">Your account has been deleted</h1>
        <p className="mt-2 text-fg-secondary">
          Your account and everything in it are gone. Thanks for trying Drive — you&apos;re always welcome back.
        </p>
        <Link href="/" className="btn btn-secondary btn-sm mt-6">
          Back to deals
        </Link>
      </div>
    </main>
  );
}
