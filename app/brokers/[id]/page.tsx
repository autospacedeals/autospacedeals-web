import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LogIn, MapPin } from "lucide-react";
import { getBrokerProfile } from "@/lib/supabase/brokers";
import { getPublishedDealsByBroker } from "@/lib/supabase/deals";
import { getMyReview, getReviewsForBroker, type ReviewViewer } from "@/lib/supabase/reviews";
import { formatAverageRating, reviewCountLabel, reviewDateLabel, reviewFullDate } from "@/lib/reviews";
import BrokerListings from "@/components/BrokerListings";
import { pageMetadata } from "@/lib/site";
import StarRating, { RatingBadge } from "@/components/StarRating";
import ReviewForm from "./ReviewForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const broker = await getBrokerProfile(id);
  if (!broker) return { title: "Broker not found" };
  return pageMetadata({
    title: broker.businessName,
    description: `${broker.businessName} — ${broker.sellerType} in ${broker.city}, ${broker.state} on Drive.`,
    path: `/brokers/${id}`,
  });
}

// Up to two initials for the decorative avatar beside the business name.
function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

export default async function BrokerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await getBrokerProfile(id);
  if (!broker) notFound();

  // Reviews run alongside the listings. Neither helper throws — before the
  // broker_reviews migration has been run they report "unavailable", and
  // the reviews section and rating badge are simply left out.
  const reviewsPromise = getReviewsForBroker(id);
  const viewerPromise = getMyReview(id);

  // Listings are secondary to the broker's own info — if fetching them
  // somehow throws, still show the profile rather than a blank error page.
  let listings: Awaited<ReturnType<typeof getPublishedDealsByBroker>> = [];
  try {
    listings = await getPublishedDealsByBroker(id);
  } catch (err) {
    console.error("Failed to load broker's listings:", err);
  }
  const [reviews, viewer] = await Promise.all([reviewsPromise, viewerPromise]);
  // Only a real average (at least one review) earns a badge or summary.
  const average = reviews.available && reviews.count > 0 ? reviews.average : null;
  const hasSummary = average != null;
  // Only invite a first review from someone who could actually leave one.
  const canReview = viewer.status === "customer" || viewer.status === "signed-out";

  return (
    <main className="container-page max-w-6xl py-8 sm:py-12">
      <Link href="/#deals" className="link-arrow mb-6 min-h-9">
        <ArrowLeft /> Back to all deals
      </Link>

      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div aria-hidden="true" className="light-bar absolute inset-x-0 top-0" />
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="avatar size-16 rounded-2xl text-xl">
            {initials(broker.businessName)}
          </span>
          <div className="min-w-0">
            <p className="label">{broker.sellerType}</p>
            <h1 className="type-page mt-1 text-3xl break-words sm:text-4xl">{broker.businessName}</h1>
            {broker.dealershipName && (
              <p className="mt-1 text-sm text-fg-muted">at {broker.dealershipName}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg-muted">
              {average != null && <RatingBadge href="#reviews" average={average} count={reviews.count} />}
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-fg-faint" /> {broker.city}, {broker.state}
              </span>
            </div>
          </div>
        </div>

        {broker.about && (
          <p className="mt-8 max-w-2xl border-t border-line pt-6 text-[15px] leading-7 break-words whitespace-pre-wrap text-fg-secondary">
            {broker.about}
          </p>
        )}

        <p className="mt-6 text-xs leading-5 text-fg-muted">
          Message {broker.businessName} from any of their listings below. Drive does not
          process payments or negotiate on your behalf.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="type-section mb-8 break-words">
          {listings.length > 0 ? `${broker.businessName}'s current deals` : "No live listings right now"}
        </h2>
        {listings.length > 0 ? (
          <BrokerListings deals={listings} />
        ) : (
          <div className="card p-8 text-center text-sm text-fg-muted">
            Check back soon, or contact them directly above.
          </div>
        )}
      </section>

      {reviews.available && (
        <section id="reviews" aria-labelledby="reviews-heading" className="mt-16">
          <h2 id="reviews-heading" className="type-section mb-8">
            Reviews
          </h2>
          {/* Desktop: the summary with the "leave a review" panel under it
              on the left, the reviews on the right. Phones stack them as
              summary, reviews, then the form — the reviews are what most
              visitors came to read. Nothing here is sticky: the form is
              too tall to stay pinned on a short laptop screen. */}
          <div
            className={`grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-x-10 ${hasSummary ? "lg:grid-rows-[auto_1fr]" : ""}`}
          >
            {hasSummary && (
              <div className="panel lg:col-start-1 lg:row-start-1 lg:self-start">
                <p className="flex items-baseline gap-2">
                  <span className="stat-value text-4xl">{formatAverageRating(average)}</span>
                  <span className="text-sm text-fg-muted">out of 5</span>
                </p>
                <StarRating value={average} size={18} decorative className="mt-3" />
                <p className="mt-2 text-sm text-fg-muted">Based on {reviewCountLabel(reviews.count)}</p>
              </div>
            )}

            <div className={`min-w-0 lg:col-start-2 lg:row-start-1 ${hasSummary ? "lg:row-span-2" : ""}`}>
              {reviews.reviews.length > 0 ? (
                <>
                  <ul className="space-y-4">
                    {reviews.reviews.map((review) => (
                      <li key={review.id} className="card p-5">
                        <div className="flex items-start gap-3">
                          <span aria-hidden="true" className="avatar">
                            {initials(review.reviewerFirstName)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <p className="font-medium break-words text-fg">{review.reviewerFirstName}</p>
                              <time
                                dateTime={review.updatedAt}
                                title={reviewFullDate(review.updatedAt)}
                                className="text-xs text-fg-muted"
                              >
                                {reviewDateLabel(review.updatedAt)}
                              </time>
                            </div>
                            <StarRating value={review.rating} size={14} className="mt-1.5" />
                          </div>
                        </div>
                        {review.text && (
                          <p className="mt-4 text-[15px] leading-7 break-words whitespace-pre-wrap text-fg-secondary">
                            {review.text}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {reviews.count > reviews.reviews.length && (
                    <p className="mt-4 text-xs text-fg-muted">
                      Showing the {reviews.reviews.length} most recent of {reviewCountLabel(reviews.count)}.
                    </p>
                  )}
                </>
              ) : (
                <div className="card p-8 text-center text-sm text-fg-muted">
                  No reviews yet.{canReview && " Be the first to leave one."}
                </div>
              )}
            </div>

            <div className={`panel lg:col-start-1 lg:self-start ${hasSummary ? "lg:row-start-2" : "lg:row-start-1"}`}>
              <ReviewPrompt
                viewer={viewer}
                brokerId={broker.id}
                businessName={broker.businessName}
                sellerType={broker.sellerType}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

// The "leave a review" side of the reviews panel: the form for customers
// (prefilled if they've already reviewed this broker), a login prompt for
// signed-out visitors, or a short note for accounts that can't review.
function ReviewPrompt({
  viewer,
  brokerId,
  businessName,
  sellerType,
}: {
  viewer: ReviewViewer;
  brokerId: string;
  businessName: string;
  sellerType: string;
}) {
  switch (viewer.status) {
    case "customer":
      return (
        <ReviewForm
          brokerId={brokerId}
          businessName={businessName}
          sellerType={sellerType}
          initialRating={viewer.review?.rating ?? null}
          initialText={viewer.review?.text ?? null}
        />
      );
    case "signed-out":
      return (
        <div>
          <h3 className="type-title">Worked with {businessName}?</h3>
          <p className="mt-1 text-sm text-fg-muted">
            Log in to your customer account to rate them and share how it went.
          </p>
          <Link
            href={`/customer/login?next=${encodeURIComponent(`/brokers/${brokerId}#reviews`)}`}
            className="btn btn-secondary mt-5 w-full"
          >
            <LogIn /> Log in to leave a review
          </Link>
          <p className="mt-3 text-center text-sm text-fg-muted">
            New here?{" "}
            <Link href="/customer/signup" className="link">
              Create a free account
            </Link>
          </p>
        </div>
      );
    case "own-profile":
      return (
        <p className="text-sm text-fg-muted">
          This is your profile. Customers who&apos;ve worked with you can rate your business here.
        </p>
      );
    case "not-customer":
      return (
        <p className="text-sm text-fg-muted">
          Reviews are left from customer accounts. You&apos;re signed in with a broker or admin account.
        </p>
      );
    default:
      return <p className="text-sm text-fg-muted">Reviews can&apos;t be posted right now. Please try again later.</p>;
  }
}
