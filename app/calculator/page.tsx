import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Scale, ArrowRight } from "lucide-react";
import LeaseCalculator from "@/components/LeaseCalculator";

export const metadata: Metadata = {
  title: "Lease Calculator",
  description:
    "Estimate any car lease payment from MSRP, residual value, money factor, term, and incentives — with real numbers pulled in automatically when available.",
};

export default function CalculatorPage() {
  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="mb-3 text-sm font-medium text-blue-400">Drive Tools</p>
        <h1 className="mb-3 text-4xl font-bold tracking-tight">Lease Calculator</h1>
        <p className="mb-8 text-lg leading-8 text-zinc-300">
          Work out a real monthly payment and due-at-signing total for any car — not just deals
          listed on Drive.
        </p>

        {/* LeaseCalculator reads a shareable-link query param via
            useSearchParams, which requires a Suspense boundary so this
            route doesn't get forced fully dynamic. */}
        <Suspense fallback={<div className="text-sm text-zinc-500">Loading calculator…</div>}>
          <LeaseCalculator />
        </Suspense>

        <Link
          href="/lease-end"
          className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:bg-white/[0.07] sm:flex-row"
        >
          <span className="flex items-center gap-3 text-center sm:text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              <Scale size={18} />
            </span>
            <span>
              <span className="block text-sm font-bold text-white">
                Lease ending soon instead?
              </span>
              <span className="block text-xs text-zinc-400">
                Try the Lease-End Calculator — buy out vs. return vs. what the car&apos;s worth.
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-white">
            Open calculator <ArrowRight size={15} />
          </span>
        </Link>
      </section>
    </main>
  );
}
