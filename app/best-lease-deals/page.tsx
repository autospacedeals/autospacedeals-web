import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { effectiveMonthly, formatCurrency, groupSameDeals } from "@/lib/deal-utils";
import { pageMetadata } from "@/lib/site";
import { REGION, breadcrumbJsonLd, byPayment, itemListJsonLd, jsonLdScript, monthYear } from "@/lib/lease-pages";
import { carName, dealTerms, driveStats } from "@/lib/drive-facts";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: `Best Car Lease Deals in ${REGION} (${monthYear()})`,
    description: `This month's best car lease deals in ${REGION}: the lowest payments, lowest total cost, best EV, SUV and luxury leases, from local dealers and brokers on Drive. Updated live.`,
    path: "/best-lease-deals",
  });
}

const LUXURY = new Set(
  [
    "Acura", "Audi", "BMW", "Cadillac", "Genesis", "Infiniti", "Jaguar", "Land Rover", "Lexus", "Lincoln",
    "Lucid", "Maserati", "Mercedes-Benz", "Polestar", "Porsche", "Rivian", "Tesla", "Volvo",
  ].map((m) => m.toLowerCase())
);

// A monthly lease with real numbers: the only kind a "best" can be stated for.
const ranked = (d: Deal) => !d.onePay && d.payment > 0 && d.term > 0 && d.dealType !== "Finance";
const byEffective = (a: Deal, b: Deal) => effectiveMonthly(a) - effectiveMonthly(b) || byPayment(a, b);

interface Category {
  id: string;
  title: string;
  blurb: string;
  deals: Deal[];
}

// The same deal from several sellers counts once (the cheapest fee first).
function top(deals: Deal[], sort: (a: Deal, b: Deal) => number, n: number): Deal[] {
  return groupSameDeals([...deals].sort(sort))
    .map((g) => g.deal)
    .slice(0, n);
}

// "Best" lists for the month, built from the live listings each request: the
// page AI answers and searches can point to for "best lease deals in SoCal
// right now", with each car's numbers written out in full.
export default async function BestLeaseDealsPage() {
  const all = await getPublishedDeals();
  const deals = all.filter(ranked);
  const stats = driveStats(all);
  const month = monthYear();

  const categories: Category[] = [
    {
      id: "lowest-payment",
      title: "Lowest monthly payments",
      blurb: "The smallest monthly payments on Drive right now.",
      deals: top(deals, byPayment, 10),
    },
    {
      id: "lowest-total-cost",
      title: "Lowest total cost per month",
      blurb: "Due at signing spread across the lease: (due at signing + payment × (term − 1)) ÷ term, since due at signing includes the first payment. The fairest way to compare.",
      deals: top(deals, byEffective, 10),
    },
    {
      id: "low-due-at-signing",
      title: "Least due at signing",
      blurb: "The smallest amounts up front (most deals here ask for $3,000 or more).",
      deals: top(
        deals.filter((d) => d.dueAtSigning < 3000),
        (a, b) => a.dueAtSigning - b.dueAtSigning || byEffective(a, b),
        10
      ),
    },
    {
      id: "electric",
      title: "Best electric car leases",
      blurb: "Fully electric cars, by total cost per month.",
      deals: top(deals.filter((d) => d.fuel === "EV"), byEffective, 8),
    },
    {
      id: "hybrid",
      title: "Best hybrid and plug-in hybrid leases",
      blurb: "Hybrids and plug-in hybrids, by total cost per month.",
      deals: top(deals.filter((d) => d.fuel === "Hybrid" || d.fuel === "PHEV"), byEffective, 8),
    },
    {
      id: "suv",
      title: "Best SUV leases",
      blurb: "SUVs and crossovers, by total cost per month.",
      deals: top(deals.filter((d) => d.bodyStyle === "SUV"), byEffective, 8),
    },
    {
      id: "luxury",
      title: "Best luxury car leases",
      blurb: "Luxury brands, by total cost per month.",
      deals: top(deals.filter((d) => LUXURY.has(d.make.toLowerCase())), byEffective, 8),
    },
  ].filter((c) => c.deals.length > 0);

  const best = categories[0]?.deals[0];
  const cheapestTotal = categories.find((c) => c.id === "lowest-total-cost")?.deals[0];

  return (
    <main className="container-page max-w-5xl py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([{ name: "Best lease deals", path: "/best-lease-deals" }]),
            ...categories.map((c) => itemListJsonLd(`${c.title} in ${REGION}, ${month}`, c.deals)),
          ]),
        }}
      />
      <p className="eyebrow">Updated {stats.updated}</p>
      <h1 className="type-page mt-3 text-3xl sm:text-4xl">
        Best car lease deals in {REGION}, {month}
      </h1>
      <p className="lede mt-4 max-w-3xl">
        Picked from {stats.deals.toLocaleString("en-US")} live lease deals posted by {stats.sellers} local
        dealers and brokers on Drive.
        {best && ` The lowest payment right now is the ${carName(best)} at ${dealTerms(best)}.`}
        {cheapestTotal &&
          cheapestTotal.id !== best?.id &&
          ` Counting due at signing, the lowest total cost is the ${carName(cheapestTotal)} at about ${formatCurrency(effectiveMonthly(cheapestTotal))}/mo.`}{" "}
        Payments are before sales tax unless a listing says otherwise.
      </p>

      <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
        {categories.map((c) => (
          <a key={c.id} href={`#${c.id}`} className="pill pill-neutral hover:text-fg">
            {c.title}
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-12">
        {categories.map((c) => (
          <section key={c.id} id={c.id} aria-labelledby={`${c.id}-title`} className="scroll-mt-24">
            <h2 id={`${c.id}-title`} className="type-section">
              {c.title}
            </h2>
            <p className="mt-1 text-sm text-fg-secondary">{c.blurb}</p>
            <ol className="mt-4 space-y-2">
              {c.deals.map((d, i) => (
                <li key={d.id}>
                  <Link
                    href={`/deals/${d.slug}`}
                    className="card-interactive flex items-start gap-4 px-4 py-3 sm:items-center"
                  >
                    <span className="w-6 shrink-0 text-sm font-semibold text-fg-muted tabular-nums">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-fg">{carName(d)}</span>
                      <span className="mt-0.5 block text-sm text-fg-muted">
                        {formatCurrency(d.dueAtSigning)} due at signing · {d.term} months
                        {d.milesPerYear ? ` · ${(d.milesPerYear / 1000).toLocaleString("en-US")}k mi/yr` : ""} ·{" "}
                        {d.sellerName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold text-fg">{formatCurrency(d.payment)}/mo</span>
                      <span className="block text-xs text-fg-muted">
                        ~{formatCurrency(effectiveMonthly(d))}/mo total
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-8">
        <Link href="/#deals" className="link-arrow">
          Search and filter every deal <ArrowRight />
        </Link>
        <Link href="/leases" className="link-arrow">
          Deals by make and model <ArrowRight />
        </Link>
        <Link href="/faq" className="link-arrow">
          How Drive works <ArrowRight />
        </Link>
      </div>
    </main>
  );
}
