import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Deal } from "@/lib/deals-data";
import { getDealBySlugDb, getPublishedDeals } from "@/lib/supabase/deals";
import { dealTitle, formatCurrency, getSimilarDealsFrom } from "@/lib/deal-utils";
import DealDetailView from "@/components/DealDetailView";

// Always fetch fresh — a broker can edit/reprice/remove their own listing at
// any time, and the detail page should never show stale info.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const deal = await getDealBySlugDb(slug);
  if (!deal) return { title: "Deal not found" };

  // generateMetadata runs as its own server function, separate from the page
  // component below — a throw here isn't caught by any try/catch inside
  // DealDetailPage, so it crashes the whole request on its own. Guard every
  // field access defensively rather than relying on the page body's fixes.
  try {
    const dealTypeLabel = (deal.dealType ?? "Lease").toLowerCase();
    const title = `${dealTitle(deal)} — ${formatCurrency(deal.payment)}/mo`;
    const description = `${dealTitle(deal)} in ${deal.city}, ${deal.state}: ${formatCurrency(
      deal.payment
    )}/mo, ${formatCurrency(deal.dueAtSigning)} due at signing, ${deal.term} month ${dealTypeLabel} from ${deal.sellerName}.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: deal.images && deal.images.length > 0 ? [{ url: deal.images[0] }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: deal.images && deal.images.length > 0 ? [deal.images[0]] : undefined,
      },
    };
  } catch (err) {
    console.error("generateMetadata failed for", deal.id, err);
    return { title: dealTitle(deal) || "Deal details" };
  }
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const deal = await getDealBySlugDb(slug);
  if (!deal) notFound();

  let similar: Deal[] = [];
  try {
    const allDeals = await getPublishedDeals();
    similar = getSimilarDealsFrom(allDeals, deal, 3);
  } catch (err) {
    console.error("DealDetailPage: similar deals failed for", deal.id, err);
  }

  return <DealDetailView deal={deal} similar={similar} />;
}
