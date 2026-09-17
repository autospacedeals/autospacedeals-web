import type { Metadata } from "next";
import { Suspense } from "react";
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
      </section>
    </main>
  );
}
