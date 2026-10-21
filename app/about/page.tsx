import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { formatCurrency } from "@/lib/deal-utils";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, pageMetadata } from "@/lib/site";
import { REGION, breadcrumbJsonLd, jsonLdScript } from "@/lib/lease-pages";
import { ONE_LINER, driveStats } from "@/lib/drive-facts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "About Drive",
  description: `${SITE_NAME} is a car lease marketplace for ${REGION}: real deals from local dealers and brokers, compared side by side and free for shoppers.`,
  path: "/about",
});

// Who Drive is, stated plainly in one place: the page an AI assistant or a
// search engine reads to describe Drive, and to answer "is it legit?".
export default async function AboutPage() {
  const stats = driveStats(await getPublishedDeals());
  const glance: [string, string][] = [
    ["Live lease deals", stats.deals.toLocaleString("en-US")],
    ["Dealers & brokers", String(stats.sellers)],
    ["Brands", String(stats.brands)],
    ["Payments from", stats.lowest ? `${formatCurrency(stats.lowest.payment)}/mo` : "—"],
  ];

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            {
              "@context": "https://schema.org",
              "@type": "AboutPage",
              url: `${SITE_URL}/about`,
              name: `About ${SITE_NAME}`,
              mainEntity: {
                "@type": "Organization",
                name: SITE_NAME,
                alternateName: ["Drive (idriveus.com)", "idriveus"],
                url: SITE_URL,
                logo: `${SITE_URL}/apple-icon.png`,
                description: SITE_DESCRIPTION,
                email: "rob@idriveus.com",
                areaServed: { "@type": "AdministrativeArea", name: REGION },
                knowsAbout: ["Car leasing", "Auto brokers", "Lease deals", "Electric vehicle leases"],
              },
            },
            breadcrumbJsonLd([{ name: "About", path: "/about" }]),
          ]),
        }}
      />
      <header className="container-prose pt-12 pb-8 sm:pt-16">
        <p className="eyebrow">About</p>
        <h1 className="type-page mt-4">About Drive</h1>
        <p className="lede mt-4">{ONE_LINER}</p>
      </header>

      <div className="container-prose pb-16">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {glance.map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-fg-muted">{label}</dt>
              <dd className="mt-0.5 font-semibold text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-fg-muted">Live numbers as of {stats.updated}.</p>

        <div className="mt-6">
          <Section title="Why Drive exists">
            <p>
              {`The best lease deals in ${REGION} are scattered`} across broker Instagram posts, forum
              threads, spreadsheets and dealer websites, each written a different way. Comparing them
              means copying numbers into your own notes and guessing what&apos;s included.
            </p>
            <p>
              Drive puts them in one place and one format: the monthly payment, due at signing, term,
              miles per year, broker fee and what&apos;s included, side by side, so you can see which
              deal is actually cheapest.
            </p>
          </Section>

          <Section title="How it works for shoppers">
            <ul>
              <li>
                <strong>Compare.</strong> Search and filter every deal by make, model, body style,
                payment, term and seller, or sort by total cost per month (due at signing included).
              </li>
              <li>
                <strong>Save and get alerts.</strong> Save deals, or save a search and get an email when
                a new match is posted.
              </li>
              <li>
                <strong>Message the seller.</strong> Talk to the dealer or broker through Drive. Your
                phone number stays private until you choose to share it.
              </li>
            </ul>
            <p>Drive is free for shoppers and doesn&apos;t add a fee to any deal.</p>
          </Section>

          <Section title="Where the deals come from">
            <p>
              Every deal is posted by the dealer or broker offering it. Many sellers connect a Google
              Sheet or their website&apos;s deals page, and Drive keeps their listings in sync
              automatically, so payments stay current and sold cars come down. Listings whose numbers
              look like a typo are held back before they go live.
            </p>
            <p>
              Drive doesn&apos;t sell, lease or finance vehicles, take payments, or negotiate on your
              behalf. Deals are subject to availability and credit approval; always confirm the final
              price and terms with the seller before signing.
            </p>
          </Section>

          <Section title="For dealers and brokers">
            <p>
              Post deals from a Google Sheet, a link to your website, a screenshot, pasted text, or one
              car at a time. Shoppers message you directly. Listing is free while Drive launches.{" "}
              <Link href="/contact?topic=dealer" className="link">
                Get in touch to list your deals
              </Link>
              .
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Email{" "}
              <a href="mailto:rob@idriveus.com" className="link">
                rob@idriveus.com
              </a>{" "}
              or use the{" "}
              <Link href="/contact" className="link">
                contact form
              </Link>
              . We reply by email.
            </p>
          </Section>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-8">
          <Link href="/best-lease-deals" className="link-arrow">
            This month&apos;s best deals <ArrowRight />
          </Link>
          <Link href="/faq" className="link-arrow">
            Questions and answers <ArrowRight />
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <h2 className="type-section text-2xl sm:text-2xl">{title}</h2>
      <div className="prose-drive mt-4">{children}</div>
    </section>
  );
}
