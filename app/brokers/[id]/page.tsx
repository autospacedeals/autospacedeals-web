import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, Store } from "lucide-react";
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
    description: `${broker.businessName} — ${broker.sellerType} in ${broker.city}, ${broker.state} on AutoSpace Deals.`,
  };
}

export default async function BrokerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const broker = await getBrokerProfile(id);
  if (!broker) notFound();

  const listings = await getPublishedDealsByBroker(id);
  const phone = phoneDigits(broker.contactPhone);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/#deals"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
      >
        <ArrowLeft size={16} /> Back to all deals
      </Link>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-400">
          <Store size={16} /> {broker.sellerType}
        </p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">{broker.businessName}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-400">
          <span className="flex items-center gap-1.5">
            <MapPin size={15} /> {broker.city}, {broker.state}
          </span>
          <a href={`tel:${phone}`} className="flex items-center gap-1.5 font-semibold text-white hover:underline">
            <Phone size={15} /> {broker.contactPhone}
          </a>
        </div>

        {broker.about && (
          <p className="mt-5 max-w-2xl whitespace-pre-wrap leading-7 text-zinc-300">{broker.about}</p>
        )}

        <p className="mt-5 text-xs leading-5 text-zinc-500">
          Contacting {broker.businessName} connects you directly — AutoSpace Deals does not
          process payments or negotiate on your behalf.
        </p>
      </div>

      <section className="mt-10">
        <h2 className="mb-5 text-2xl font-black">
          {listings.length > 0 ? `${broker.businessName}'s Current Deals` : "No live listings right now"}
        </h2>
        {listings.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {listings.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-500">
            Check back soon, or contact them directly above.
          </div>
        )}
      </section>
    </main>
  );
}
