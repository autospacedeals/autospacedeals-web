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
      <header className="container-page max-w-4xl pt-12 pb-8 sm:pt-16">
        <p className="eyebrow">Drive tools</p>
        <h1 className="type-page mt-4">Lease Calculator</h1>
        <p className="lede mt-4 max-w-2xl">
          Work out a real monthly payment and due-at-signing total for any car — not just deals
          listed on Drive.
        </p>
      </header>

      <section className="container-page max-w-4xl pb-16">
        {/* LeaseCalculator reads a shareable-link query param via
            useSearchParams, which requires a Suspense boundary so this
            route doesn't get forced fully dynamic. */}
        <Suspense
          fallback={
            <div className="skeleton h-96 w-full">
              <span className="sr-only">Loading calculator…</span>
            </div>
          }
        >
          <LeaseCalculator />
        </Suspense>

        <Link
          href="/lease-end"
          className="card-interactive group mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg">
              <Scale size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-fg">Lease ending soon instead?</span>
              <span className="mt-0.5 block text-[13px] text-fg-muted">
                Try the Lease-End Calculator — buy out vs. return vs. what the car&apos;s worth.
              </span>
            </span>
          </span>
          <span className="link-arrow shrink-0">
            Open calculator <ArrowRight />
          </span>
        </Link>
      </section>
    </main>
  );
}
