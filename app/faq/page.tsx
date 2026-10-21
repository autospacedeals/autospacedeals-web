import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { pageMetadata } from "@/lib/site";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/lease-pages";
import { driveFaq, driveStats, faqJsonLd } from "@/lib/drive-facts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "How Drive Works: Questions and Answers",
  description:
    "Is Drive free? Are the lease deals real? Do payments include tax? Plain answers about Drive, the Southern California car lease marketplace.",
  path: "/faq",
});

// The questions shoppers ask an AI about Drive, answered in one place (and
// marked up as an FAQPage) with today's numbers from the live listings.
export default async function FaqPage() {
  const faq = driveFaq(driveStats(await getPublishedDeals()));
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([faqJsonLd(faq), breadcrumbJsonLd([{ name: "How Drive works", path: "/faq" }])]),
        }}
      />
      <header className="container-prose pt-12 pb-8 sm:pt-16">
        <p className="eyebrow">How Drive works</p>
        <h1 className="type-page mt-4">Questions and answers</h1>
        <p className="lede mt-4">
          What Drive is, what it costs, and how the deals get here, in plain answers.
        </p>
      </header>

      <div className="container-prose pb-16">
        {faq.map((f) => (
          <section key={f.q} className="border-t border-line py-8">
            <h2 className="type-section text-xl sm:text-xl">{f.q}</h2>
            <p className="mt-3 text-[15px] leading-7 text-fg-secondary">{f.a}</p>
          </section>
        ))}
        <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-8">
          <Link href="/best-lease-deals" className="link-arrow">
            This month&apos;s best deals <ArrowRight />
          </Link>
          <Link href="/about" className="link-arrow">
            About Drive <ArrowRight />
          </Link>
          <Link href="/contact" className="link-arrow">
            Ask us something else <ArrowRight />
          </Link>
        </div>
      </div>
    </main>
  );
}
