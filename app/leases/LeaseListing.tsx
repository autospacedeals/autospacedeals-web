import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import DealCard from "@/components/DealCard";
import type { Deal } from "@/lib/deals-data";
import { formatCurrency, groupSameDeals } from "@/lib/deal-utils";
import {
  type DealSummary,
  breadcrumbJsonLd,
  byPayment,
  itemListJsonLd,
  jsonLdScript,
  plural,
  summarySentence,
} from "@/lib/lease-pages";

// The body of a make or model page: breadcrumbs, the summary in a sentence
// and at a glance, a few plain questions answered from the live deals, and
// the deals themselves, lowest payment first.
export default function LeaseListing({
  name,
  heading,
  crumbs,
  deals,
  summary,
  related,
  relatedLabel,
  maxDeals = 60,
}: {
  // "BMW X5": what the deals are.
  name: string;
  heading: string;
  crumbs: { name: string; path: string }[];
  deals: Deal[];
  summary: DealSummary;
  // Other models of the make, or this make's models.
  related: { label: string; href: string; note: string }[];
  relatedLabel: string;
  maxDeals?: number;
}) {
  const sorted = [...deals].sort(byPayment);
  // The same deal from several sellers is one card (lib/deal-utils.ts).
  const allGroups = groupSameDeals(sorted);
  const groups = allGroups.slice(0, maxDeals);
  const shown = groups.map((g) => g.deal);
  const updated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const low = summary.lowest;
  const faq = [
    low && {
      q: `What's the cheapest ${name} lease in Southern California right now?`,
      a:
        `The ${low.year} ${low.make} ${low.model}${low.trim ? ` ${low.trim}` : ""} at ${formatCurrency(low.payment)}/mo ` +
        `with ${formatCurrency(low.dueAtSigning)} due at signing, for ${low.term} months` +
        (low.milesPerYear ? ` and ${(low.milesPerYear / 1000).toLocaleString("en-US")}k miles a year` : "") +
        `, from ${low.sellerName}.`,
    },
    {
      q: `How many ${name} lease deals are there?`,
      a: `${plural(summary.count, "live deal")} from ${plural(summary.sellers, "seller")} on Drive as of ${updated}.`,
    },
  ].filter((x): x is { q: string; a: string } => Boolean(x));

  return (
    <main className="container-page max-w-6xl py-8 sm:py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd(crumbs),
            itemListJsonLd(`${name} lease deals in Southern California`, shown),
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ]),
        }}
      />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
        {crumbs.map((c, i) => (
          <span key={c.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
            {i < crumbs.length - 1 ? (
              <Link href={c.path} className="hover:text-fg">
                {c.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-fg-secondary">
                {c.name}
              </span>
            )}
          </span>
        ))}
      </nav>

      <h1 className="type-page mt-4 text-3xl sm:text-4xl">{heading}</h1>
      <p className="lede mt-4 max-w-3xl">
        {summarySentence(name, summary)} Updated {updated}.
      </p>

      {low && (
        <dl className="mt-6 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            ["Lowest payment", `${formatCurrency(low.payment)}/mo`],
            ["Due at signing", formatCurrency(low.dueAtSigning)],
            ["Terms", summary.terms.length > 1 ? `${summary.terms[0]}–${summary.terms[summary.terms.length - 1]} mo` : `${summary.terms[0] ?? low.term} mo`],
            ["Sellers", String(summary.sellers)],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-fg-muted">{label}</dt>
              <dd className="mt-0.5 font-semibold text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {related.length > 0 && (
        <section className="mt-8" aria-label={relatedLabel}>
          <h2 className="text-sm font-medium text-fg-secondary">{relatedLabel}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="pill pill-neutral hover:text-fg">
                  {r.label} <span className="text-fg-muted">· {r.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="type-section mb-6">
          {allGroups.length > groups.length ? `The ${groups.length} lowest payments` : `All ${plural(deals.length, "deal")}`}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <DealCard key={g.deal.id} deal={g.deal} otherSellers={g.others} />
          ))}
        </div>
      </section>

      <section className="mt-14 max-w-3xl border-t border-line pt-10">
        <h2 className="type-section">Common questions</h2>
        <dl className="mt-4 space-y-5">
          {faq.map((f) => (
            <div key={f.q}>
              <dt className="font-medium text-fg">{f.q}</dt>
              <dd className="mt-1 text-sm text-fg-secondary">{f.a}</dd>
            </div>
          ))}
          <div>
            <dt className="font-medium text-fg">Do these prices include tax?</dt>
            <dd className="mt-1 text-sm text-fg-secondary">
              Payments are shown before sales tax unless a listing says otherwise. Log in with your ZIP code to see
              each payment with your local tax.
            </dd>
          </div>
        </dl>
        <Link href="/leasing-guide" className="link-arrow mt-6 inline-flex">
          New to leasing? Read the guide <ArrowRight />
        </Link>
      </section>
    </main>
  );
}
