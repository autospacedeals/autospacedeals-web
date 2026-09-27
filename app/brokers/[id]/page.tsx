import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { getBrokerProfile } from "@/lib/supabase/brokers";
import { getPublishedDealsByBroker } from "@/lib/supabase/deals";
import { phoneDigits } from "@/lib/deal-utils";
import DealCard from "@/components/DealCard";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const broker = await getBrokerProfile(id);
  if (!broker) return { title: "Broker not found" };
  return {
    title: broker.businessName,
    description: `${broker.businessName} — ${broker.sellerType} in ${broker.city}, ${broker.state} on Drive.`,
  };
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

  // Listings are secondary to the broker's own info — if fetching them
  // somehow throws, still show the profile rather than a blank error page.
  let listings: Awaited<ReturnType<typeof getPublishedDealsByBroker>> = [];
  try {
    listings = await getPublishedDealsByBroker(id);
  } catch (err) {
    console.error("Failed to load broker's listings:", err);
  }
  const phone = phoneDigits(broker.contactPhone);

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
              <span className="flex items-center gap-1.5">
                <MapPin size={15} className="text-fg-faint" /> {broker.city}, {broker.state}
              </span>
              <a
                href={phone ? `tel:${phone}` : undefined}
                className="flex min-h-9 items-center gap-1.5 font-medium text-fg transition-colors hover:text-accent-fg"
              >
                <Phone size={15} className="text-accent-fg" /> {broker.contactPhone || "No phone on file"}
              </a>
            </div>
          </div>
        </div>

        {broker.about && (
          <p className="mt-8 max-w-2xl border-t border-line pt-6 text-[15px] leading-7 break-words whitespace-pre-wrap text-fg-secondary">
            {broker.about}
          </p>
        )}

        <p className="mt-6 text-xs leading-5 text-fg-muted">
          Contacting {broker.businessName} connects you directly — Drive does not
          process payments or negotiate on your behalf.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="type-section mb-8 break-words">
          {listings.length > 0 ? `${broker.businessName}'s current deals` : "No live listings right now"}
        </h2>
        {listings.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {listings.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-sm text-fg-muted">
            Check back soon, or contact them directly above.
          </div>
        )}
      </section>
    </main>
  );
}
