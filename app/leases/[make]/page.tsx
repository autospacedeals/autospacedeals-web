import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { formatCurrency } from "@/lib/deal-utils";
import { pageMetadata } from "@/lib/site";
import { REGION, catalog, makePath, modelPath, monthYear, plural, summarySentence } from "@/lib/lease-pages";
import { urlValue as makeSlugParam } from "@/lib/filter-url";
import LeaseListing from "../LeaseListing";

export const dynamic = "force-dynamic";

async function findMake(slug: string) {
  return catalog(await getPublishedDeals()).find((m) => m.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ make: string }> }): Promise<Metadata> {
  const { make } = await params;
  const m = await findMake(make);
  if (!m) return { title: "Lease deals", robots: { index: false } };
  return pageMetadata({
    title: `${m.make} Lease Deals in ${REGION} (${monthYear()})`,
    description: summarySentence(m.make, m.summary),
    path: makePath(m.make),
  });
}

export default async function MakeLeasesPage({ params }: { params: Promise<{ make: string }> }) {
  const { make } = await params;
  const m = await findMake(make);
  if (!m) notFound();

  return (
    <LeaseListing
      name={m.make}
      heading={`${m.make} lease deals in ${REGION}`}
      crumbs={[
        { name: "Lease deals", path: "/leases" },
        { name: m.make, path: makePath(m.make) },
      ]}
      deals={m.deals}
      summary={m.summary}
      relatedLabel={`${m.make} models`}
      searchHref={`/?make=${makeSlugParam(m.make)}#deals`}
      related={m.models.map((mo) => ({
        label: mo.model,
        href: modelPath(m.make, mo.model),
        note: mo.summary.lowest ? `from ${formatCurrency(mo.summary.lowest.payment)}/mo` : plural(mo.deals.length, "deal"),
      }))}
    />
  );
}
