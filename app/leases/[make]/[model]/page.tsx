import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { formatCurrency } from "@/lib/deal-utils";
import { pageMetadata } from "@/lib/site";
import { REGION, catalog, makePath, modelPath, monthYear, plural, summarySentence } from "@/lib/lease-pages";
import LeaseListing from "../../LeaseListing";

export const dynamic = "force-dynamic";

async function findModel(makeSlug: string, modelSlug: string) {
  const m = catalog(await getPublishedDeals()).find((x) => x.slug === makeSlug);
  const mo = m?.models.find((x) => x.slug === modelSlug);
  return m && mo ? { m, mo } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ make: string; model: string }>;
}): Promise<Metadata> {
  const { make, model } = await params;
  const found = await findModel(make, model);
  if (!found) return { title: "Lease deals", robots: { index: false } };
  const name = `${found.m.make} ${found.mo.model}`;
  return pageMetadata({
    title: `${name} Lease Deals in ${REGION} (${monthYear()})`,
    description: summarySentence(name, found.mo.summary),
    path: modelPath(found.m.make, found.mo.model),
  });
}

export default async function ModelLeasesPage({ params }: { params: Promise<{ make: string; model: string }> }) {
  const { make, model } = await params;
  const found = await findModel(make, model);
  if (!found) notFound();
  const { m, mo } = found;
  const name = `${m.make} ${mo.model}`;

  return (
    <LeaseListing
      name={name}
      heading={`${name} lease deals in ${REGION}`}
      crumbs={[
        { name: "Lease deals", path: "/leases" },
        { name: m.make, path: makePath(m.make) },
        { name: mo.model, path: modelPath(m.make, mo.model) },
      ]}
      deals={mo.deals}
      summary={mo.summary}
      relatedLabel={`Other ${m.make} models`}
      related={m.models
        .filter((x) => x.slug !== mo.slug)
        .map((x) => ({
          label: x.model,
          href: modelPath(m.make, x.model),
          note: x.summary.lowest ? `from ${formatCurrency(x.summary.lowest.payment)}/mo` : plural(x.deals.length, "deal"),
        }))}
    />
  );
}
