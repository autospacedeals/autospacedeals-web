import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import Link from "next/link";
import { Calculator, ArrowRight, Scale } from "lucide-react";

export const metadata: Metadata = pageMetadata({
  title: "Leasing Guide",
  description:
    "Understand money factor, residual value, due at signing, effective payment, and MSDs before you sign a car lease.",
  path: "/leasing-guide",
});

export default function LeasingGuidePage() {
  return (
    <main>
      <header className="container-prose pt-12 pb-8 sm:pt-16">
        <p className="eyebrow">Drive guide</p>
        <h1 className="type-page mt-4">Car Leasing Guide</h1>
        <p className="lede mt-4">
          Leasing can be confusing at first, but most deals come down to a few
          important numbers: monthly payment, due at signing, term, mileage,
          money factor, residual value, and incentives.
        </p>
      </header>

      <div className="container-prose pb-16">
        <Link
          href="/calculator"
          className="card-interactive group flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-fg">
              <Calculator size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-fg">
                Ready to run the numbers?
              </span>
              <span className="mt-0.5 block text-[13px] text-fg-muted">
                Try the Lease Calculator on any car — plug in the numbers from any lease quote.
              </span>
            </span>
          </span>
          <span className="link-arrow shrink-0">
            Open calculator <ArrowRight />
          </span>
        </Link>

        <div className="mt-10">
          <Section n={1} title="What Is a Car Lease?">
            <p>
              A car lease is similar to a long-term rental. Instead of paying
              for the full price of the vehicle, you pay for the portion of the
              car’s value that you use during the lease term.
            </p>
            <p>
              At the end of the lease, you usually return the car, buy it out,
              or lease another vehicle.
            </p>
          </Section>

          <Section n={2} title="How a Lease Payment Works">
            <p>Your monthly lease payment is mainly based on:</p>
            <ul>
              <li>The selling price of the car</li>
              <li>The residual value</li>
              <li>The money factor</li>
              <li>Taxes and fees</li>
              <li>Incentives or rebates</li>
              <li>How much is due at signing</li>
            </ul>
          </Section>

          <Section n={3} title="What Is Money Factor?">
            <p>
              Money factor is the lease version of an interest rate. A lower
              money factor usually means a better lease deal.
            </p>
            <p className="formula">
              Money Factor × 2400 = Approximate APR
            </p>
            <p>
              Example: a money factor of 0.00150 is approximately equal to a
              3.6% APR.
            </p>
          </Section>

          <Section n={4} title="What Is Residual Value?">
            <p>
              Residual value is what the lender estimates the car will be worth
              at the end of the lease.
            </p>
            <p>
              A higher residual value usually lowers the lease payment because
              you are paying for less depreciation.
            </p>
            <p>
              Example: if a $60,000 car has a 60% residual, the estimated
              lease-end value is $36,000.
            </p>
          </Section>

          <Section n={5} title="What Is Due at Signing?">
            <p>
              Due at signing is the total amount paid when starting the lease.
              It may include first month’s payment, taxes, registration, fees,
              and sometimes a down payment.
            </p>
            <p>
              A lower monthly payment with a large due-at-signing amount is not
              always the better deal. Always compare the Effective Payment.
            </p>
          </Section>

          <Section n={6} title="Effective Payment">
            <p>
              Effective Payment helps compare deals with different upfront
              amounts.
            </p>
            <p className="formula">
              Effective Payment = (Total Monthly Payments + Due at Signing) ÷
              Lease Term
            </p>
            <p>
              Example: $399/month for 36 months with $3,000 due at signing has
              an Effective Payment of about $482 (($399 × 36 + $3,000) ÷ 36).
            </p>
          </Section>

          <Section n={7} title="What Are MSDs (Multiple Security Deposits)?">
            <p>
              Multiple security deposits are extra, refundable deposits you pay
              when you start a lease. Each deposit is usually about one monthly
              payment (rounded up), and each one lowers the lease&apos;s money
              factor a little, so your monthly payment goes down. You get the
              deposits back at the end of the lease, as long as everything on
              the lease is paid up.
            </p>
            <p>
              Not every brand offers them, and the rules change. The lender sets
              the maximum number of deposits (often up to 7–10) and how much
              each one lowers the money factor (often around 0.00007–0.0001
              each). Always confirm with the dealer or broker.
            </p>
            <p className="formula">
              Monthly savings ≈ Money factor reduction × (Selling price +
              Residual value)
            </p>
            <p>
              Example: a $60,000 car with a $35,000 residual and a $600 payment.
              Seven $600 deposits ($4,200, refundable) that each cut the money
              factor by 0.00007 lower it by 0.00049 — about 0.00049 × $95,000 ≈
              $46 less per month, or roughly $1,670 saved over 36 months. That
              works out to about a 13% yearly return on the deposits, risk-free,
              which is why MSDs are popular when a brand offers them.
            </p>
            <p>
              On Drive, a listing that says something like &quot;7 MSDs&quot;
              means the advertised payment already assumes those deposits. The
              deposits are paid at signing on top of the due-at-signing amount,
              and they&apos;re not part of the Effective Payment because you get
              them back. Skip MSDs if you&apos;d rather keep that cash free, and
              ask what the payment is without them.
            </p>
          </Section>

          <Section n={8} title="Common Lease Incentives">
            <ul>
              <li>Loyalty credit</li>
              <li>Conquest credit</li>
              <li>Lease cash</li>
              <li>College graduate incentive</li>
              <li>Military incentive</li>
              <li>EV or clean vehicle incentives</li>
            </ul>
            <p>
              Incentives may depend on location, credit approval, current
              vehicle ownership, brand eligibility, and lender rules.
            </p>
          </Section>

          <Section n={9} title="Common Lease Mistakes">
            <ul>
              <li>Only looking at monthly payment</li>
              <li>Ignoring the due-at-signing amount</li>
              <li>Putting too much money down</li>
              <li>Not checking mileage limits</li>
              <li>Forgetting broker, dealer, tax, and registration fees</li>
              <li>Assuming every incentive applies to everyone</li>
            </ul>
          </Section>

          <Section n={10} title="What Makes a Good Lease Deal?">
            <ul>
              <li>Strong discount off MSRP</li>
              <li>Low money factor</li>
              <li>High residual value</li>
              <li>Useful incentives</li>
              <li>Low due at signing</li>
              <li>Clear fees and terms</li>
            </ul>
          </Section>

          <Section n={11} title="What Happens When Your Lease Ends?">
            <p>
              At lease-end you usually have three options: buy the car at its residual (payoff)
              value, return it and walk away, or trade it in toward something new.
            </p>
            <p>
              Buying out isn&apos;t automatically the wrong move — if the car is worth more than
              the payoff amount, you have built-in equity. Returning has its own costs too: a
              disposition fee, and a per-mile charge for any miles over your allowance.
            </p>
            {/* The utilities undo .prose-drive's accent/underline link style so
                this reads as the same quiet link-arrow used across the site. */}
            <Link href="/lease-end" className="link-arrow mt-3 text-fg-secondary no-underline hover:text-fg">
              <Scale /> Compare buyout vs. return with the Lease-End Calculator
              <ArrowRight />
            </Link>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3 border-t border-line py-10 sm:grid-cols-[4rem_minmax(0,1fr)]">
      <p className="pt-1.5 font-mono text-xs text-accent-fg">{String(n).padStart(2, "0")}</p>
      <div>
        <h2 className="type-section text-2xl sm:text-2xl">{title}</h2>
        <div className="prose-drive mt-4">{children}</div>
      </div>
    </section>
  );
}
