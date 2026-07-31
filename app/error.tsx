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
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <CircleAlert size={32} className="text-amber-400" />
      <h1 className="mt-4 text-2xl font-black">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-400">
        This page hit an unexpected error. It&apos;s been logged — try again, or head back to
        the homepage.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
        >
          <RotateCcw size={15} /> Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
        >
          Back to homepage
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-zinc-700">Error ref: {error.digest}</p>}
    </main>
  );
}
