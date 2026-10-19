import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { formatCurrency } from "@/lib/deal-utils";
import { pageMetadata } from "@/lib/site";
import {
  REGION,
  breadcrumbJsonLd,
  catalog,
  jsonLdScript,
  makePath,
  modelPath,
  monthYear,
  plural,
  summarySentence,
} from "@/lib/lease-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: `Car Lease Deals in ${REGION} (${monthYear()})`,
    description: `Today's car lease deals in ${REGION} by make and model, with the lowest monthly payment and due at signing for each — from local dealers and brokers on Drive.`,
    path: "/leases",
  });
}

// Every make and model with live deals and its lowest payment: the page an
// AI answer or a search result can point to for "car lease deals in SoCal".
export default async function LeasesPage() {
  const deals = await getPublishedDeals();
  const makes = catalog(deals);
  const sellers = new Set(deals.map((d) => d.brokerId ?? d.sellerName)).size;
  const updated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  return (
    <main className="container-page max-w-5xl py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd([{ name: "Lease deals", path: "/leases" }])) }}
      />
      <p className="eyebrow">Browse by car</p>
      <h1 className="type-page mt-3 text-3xl sm:text-4xl">Car lease deals in {REGION}</h1>
      <p className="lede mt-4">
        {plural(deals.length, "live lease deal")} from {sellers} {sellers === 1 ? "seller" : "dealers and brokers"} across{" "}
        {plural(makes.length, "brand")}, updated {updated}. Each car below shows its lowest monthly payment
        right now; open one to compare every deal.
      </p>

      <div className="mt-10 space-y-10">
        {makes.map((m) => (
          <section key={m.slug} aria-labelledby={`make-${m.slug}`}>
            <h2 id={`make-${m.slug}`} className="type-title">
              <Link href={makePath(m.make)} className="hover:text-accent-fg">
                {m.make} lease deals
              </Link>
            </h2>
            <p className="mt-1 text-sm text-fg-secondary">{summarySentence(m.make, m.summary)}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {m.models.map((mo) => (
                <li key={mo.slug}>
                  <Link
                    href={modelPath(m.make, mo.model)}
                    className="card-interactive flex items-baseline justify-between gap-3 px-4 py-3"
                  >
                    <span className="min-w-0 truncate font-medium text-fg">
                      {m.make} {mo.model}
                    </span>
                    <span className="shrink-0 text-sm text-fg-muted">
                      {mo.summary.lowest ? `from ${formatCurrency(mo.summary.lowest.payment)}/mo` : plural(mo.deals.length, "deal")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Link href="/#deals" className="link-arrow mt-12 inline-flex">
        Search and filter every deal <ArrowRight />
      </Link>
    </main>
  );
}
