export default function LeasingGuidePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-4xl px-6 py-16">
        <p className="mb-3 text-sm font-medium text-blue-400">
          AutoSpaceDeals Guide
        </p>

        <h1 className="mb-6 text-4xl font-bold tracking-tight">
          Car Leasing Guide
        </h1>

        <p className="mb-10 text-lg leading-8 text-zinc-300">
          Leasing can be confusing at first, but most deals come down to a few
          important numbers: monthly payment, due at signing, term, mileage,
          money factor, residual value, and incentives.
        </p>

        <div className="space-y-10">
          <Section title="What Is a Car Lease?">
            <p>
              A car lease is similar to a long-term rental. Instead of paying
              for the full price of the vehicle, you pay for the portion of the
              car’s value that you use during the lease term.
            </p>
            <p>
              At the end of the lease, you usually return the car, buy it out,
              or lease/finance another vehicle.
            </p>
          </Section>

          <Section title="How a Lease Payment Works">
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

          <Section title="What Is Money Factor?">
            <p>
              Money factor is the lease version of an interest rate. A lower
              money factor usually means a better lease deal.
            </p>
            <p className="rounded-xl bg-zinc-900 p-4 font-mono text-sm text-zinc-200">
              Money Factor × 2400 = Approximate APR
            </p>
            <p>
              Example: a money factor of 0.00150 is approximately equal to a
              3.6% APR.
            </p>
          </Section>

          <Section title="What Is Residual Value?">
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

          <Section title="What Is Due at Signing?">
            <p>
              Due at signing is the total amount paid when starting the lease.
              It may include first month’s payment, taxes, registration, fees,
              and sometimes a down payment.
            </p>
            <p>
              A lower monthly payment with a large due-at-signing amount is not
              always the better deal. Always compare the effective monthly cost.
            </p>
          </Section>

          <Section title="Effective Monthly Payment">
            <p>
              Effective monthly payment helps compare deals with different
              upfront amounts.
            </p>
            <p className="rounded-xl bg-zinc-900 p-4 font-mono text-sm text-zinc-200">
              Effective Monthly = (Monthly Payment × Term + Due at Signing) ÷
              Term
            </p>
            <p>
              Example: $399/month for 36 months with $3,000 due at signing has
              an effective monthly cost of about $482.
            </p>
          </Section>

          <Section title="Common Lease Incentives">
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

          <Section title="Common Lease Mistakes">
            <ul>
              <li>Only looking at monthly payment</li>
              <li>Ignoring the due-at-signing amount</li>
              <li>Putting too much money down</li>
              <li>Not checking mileage limits</li>
              <li>Forgetting broker, dealer, tax, and registration fees</li>
              <li>Assuming every incentive applies to everyone</li>
            </ul>
          </Section>

          <Section title="What Makes a Good Lease Deal?">
            <ul>
              <li>Strong discount off MSRP</li>
              <li>Low money factor</li>
              <li>High residual value</li>
              <li>Useful incentives</li>
              <li>Low due at signing</li>
              <li>Clear fees and terms</li>
            </ul>
          </Section>
        </div>
      </section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      <div className="space-y-4 leading-7 text-zinc-300 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}