"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CircleAlert, RotateCcw } from "lucide-react";

// App-wide fallback for any page that throws an uncaught error server- or
// client-side. Without this, Next.js shows its bare "This page couldn't
// load" screen with nothing actionable. This also logs the error to the
// browser console (and Vercel captures it server-side regardless) so it's
// easier to track down what actually broke.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled page error:", error);
  }, [error]);

  return (
    <main className="container-prose flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full border border-warning/25 bg-warning-soft text-warning">
        <CircleAlert size={22} />
      </div>
      <h1 className="type-page mt-6 text-3xl sm:text-4xl">Something went wrong</h1>
      <p className="lede mt-4 max-w-md">
        This page hit an unexpected error. It&apos;s been logged — try again, or head back to
        the homepage.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          <RotateCcw /> Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Back to homepage
        </Link>
      </div>
      {error.digest && <p className="mt-8 font-mono text-xs text-fg-muted">Error ref: {error.digest}</p>}
    </main>
  );
}
