import type { Metadata } from "next";
import LeaseEndCalculator from "@/components/LeaseEndCalculator";

export const metadata: Metadata = {
  title: "Lease-End Calculator",
  description:
    "Should you buy out your lease or return it? Compare the real numbers — payoff, fees, excess mileage, and what the car is actually worth.",
};

export default function LeaseEndPage() {
  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="mb-3 text-sm font-medium text-blue-400">Drive Tools</p>
        <h1 className="mb-3 text-4xl font-bold tracking-tight">Lease-End Calculator</h1>
        <p className="mb-8 text-lg leading-8 text-zinc-300">
          Buy out, return, or trade in? Compare what buying out actually costs against what the
          car is worth, versus the fees you&apos;d pay to just hand it back.
        </p>

        <LeaseEndCalculator />
      </section>
    </main>
  );
}
