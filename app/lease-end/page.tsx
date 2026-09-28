import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import LeaseEndCalculator from "@/components/LeaseEndCalculator";

export const metadata: Metadata = pageMetadata({
  title: "Lease-End Calculator",
  description:
    "Should you buy out your lease or return it? Compare the real numbers — payoff, fees, excess mileage, and what the car is actually worth.",
  path: "/lease-end",
});

export default function LeaseEndPage() {
  return (
    <main>
      <header className="container-page max-w-4xl pt-12 pb-8 sm:pt-16">
        <p className="eyebrow">Drive tools</p>
        <h1 className="type-page mt-4">Lease-End Calculator</h1>
        <p className="lede mt-4 max-w-2xl">
          Buy out, return, or trade in? Compare what buying out actually costs against what the
          car is worth, versus the fees you&apos;d pay to just hand it back.
        </p>
      </header>

      <section className="container-page max-w-4xl pb-16">
        <LeaseEndCalculator />
      </section>
    </main>
  );
}
