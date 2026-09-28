import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Deal } from "@/lib/deals-data";
import { getDealBySlugDb, getPublishedDeals } from "@/lib/supabase/deals";
import { getBrokerRatingSummary, type BrokerRatingSummary } from "@/lib/supabase/reviews";
import { getSavedSearchesAvailable } from "@/lib/supabase/saved-searches";
import { dealTitle, formatCurrency, getSimilarDealsFrom } from "@/lib/deal-utils";
import { buildDealJsonLd, serializeJsonLd } from "@/lib/deal-json-ld";
import DealDetailView from "@/components/DealDetailView";
import { SITE_NAME } from "@/lib/site";

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
    // A one-pay lease has no monthly payment (payment is 0 by convention) —
    // headline its single up-front total instead of "$0/mo".
    const price = deal.onePay
      ? `${formatCurrency(deal.dueAtSigning)} one-pay`
      : `${formatCurrency(deal.payment)}/mo`;
    const title = `${dealTitle(deal)} — ${price}`;
    const description = deal.onePay
      ? `${dealTitle(deal)} in ${deal.city}, ${deal.state}: ${formatCurrency(deal.dueAtSigning)} one-pay, ${deal.term} month ${dealTypeLabel} from ${deal.sellerName}.`
      : `${dealTitle(deal)} in ${deal.city}, ${deal.state}: ${formatCurrency(
          deal.payment
        )}/mo, ${formatCurrency(deal.dueAtSigning)} due at signing, ${deal.term} month ${dealTypeLabel} from ${deal.sellerName}.`;

    return {
      title,
      description,
      alternates: { canonical: `/deals/${deal.slug}` },
      openGraph: {
        type: "website",
        siteName: SITE_NAME,
        url: `/deals/${deal.slug}`,
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

  // The seller's average rating for the contact card's trust badge — a
  // nice-to-have, fetched alongside the similar deals. It never throws (and
  // is null before the reviews migration has been run); the .catch is
  // belt and braces so it can't take the listing down either way.
  const ratingPromise: Promise<BrokerRatingSummary | null> = deal.brokerId
    ? getBrokerRatingSummary(deal.brokerId).catch((err) => {
        console.error("DealDetailPage: broker rating failed for", deal.id, err);
        return null;
      })
    : Promise.resolve(null);
  // Whether "Get matched" can also offer an alert for new matches (false
  // until the saved-searches migration has been run). Never throws.
  const alertsPromise = getSavedSearchesAvailable().catch((err) => {
    console.error("DealDetailPage: saved searches check failed for", deal.id, err);
    return false;
  });

  let similar: Deal[] = [];
  try {
    const allDeals = await getPublishedDeals();
    similar = getSimilarDealsFrom(allDeals, deal, 3);
  } catch (err) {
    console.error("DealDetailPage: similar deals failed for", deal.id, err);
  }
  const [brokerRating, alertsAvailable] = await Promise.all([ratingPromise, alertsPromise]);

  // schema.org Car + lease Offer for search engines, rendered server-side.
  // Purely additive — if anything about this listing can't be described or
  // serialized, the script is skipped and the page renders as normal.
  let jsonLd: string | null = null;
  try {
    const data = buildDealJsonLd(deal);
    jsonLd = data ? serializeJsonLd(data) : null;
  } catch (err) {
    console.error("DealDetailPage: JSON-LD failed for", deal.id, err);
  }

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <DealDetailView
        deal={deal}
        similar={similar}
        brokerRating={brokerRating}
        alertsAvailable={alertsAvailable}
      />
    </>
  );
}
