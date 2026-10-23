import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { getSavedSearchesAvailable } from "@/lib/supabase/saved-searches";
import HomeClient from "@/components/HomeClient";
import { filtersFromParams } from "@/lib/filter-url";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { REGION, byPayment, itemListJsonLd, jsonLdScript } from "@/lib/lease-pages";

// Who Drive is, for search engines and AI answers: "Drive" alone is a
// common word, so the name is tied to the domain.
const ORGANIZATION_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: ["Drive (idriveus.com)", "idriveus"],
    url: SITE_URL,
    logo: `${SITE_URL}/apple-icon.png`,
    description: SITE_DESCRIPTION,
    email: "rob@idriveus.com",
    areaServed: { "@type": "AdministrativeArea", name: "Southern California" },
    // The page that describes Drive in full (app/about).
    subjectOf: { "@type": "AboutPage", url: `${SITE_URL}/about` },
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: "idriveus.com",
    url: SITE_URL,
  },
];

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Compare Car Lease Deals in Southern California`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Compare Car Lease Deals in Southern California`,
    description: SITE_DESCRIPTION,
  },
};

// Always fetch fresh — brokers can add/edit/remove their own listings from
// their dashboard at any time, and those changes should show up on the live
// site immediately rather than waiting for a rebuild.
export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Neither throws: the availability check just says false (and logs) if
  // the saved-searches migration hasn't been run yet.
  const [deals, savedSearchesAvailable] = await Promise.all([
    getPublishedDeals(),
    getSavedSearchesAvailable(),
  ]);
  // A linked search (/?make=bmw&body=suv, see lib/filter-url.ts) renders
  // already filtered.
  const raw = await searchParams;
  const initial = filtersFromParams({ get: (key) => (typeof raw[key] === "string" ? raw[key] : null) }, deals);
  // Where the visitor is, roughly, from their IP (Vercel adds these headers;
  // nothing locally): "Irvine, CA" for the masthead's location chip.
  const h = await headers();
  const city = decodeGeo(h.get("x-vercel-ip-city"));
  const region = decodeGeo(h.get("x-vercel-ip-country-region"));
  const visitorPlace = h.get("x-vercel-ip-country") === "US" && city ? (region ? `${city}, ${region}` : city) : null;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            ...ORGANIZATION_JSON_LD,
            // The deals in the page's HTML, readable without running its script.
            itemListJsonLd(
              `Lowest lease payments in ${REGION}`,
              deals.filter((d) => !d.onePay && d.payment > 0).sort(byPayment).slice(0, 20)
            ),
          ]),
        }}
      />
      <HomeClient
        initialDeals={deals}
        savedSearchesAvailable={savedSearchesAvailable}
        initialFilters={initial.filters}
        initialSort={initial.sortBy}
        visitorPlace={visitorPlace}
      />
    </>
  );
}

// Vercel's geo headers are URI-encoded ("San%20Diego"). Letters, spaces and
// a few marks only, so nothing odd lands in the page.
function decodeGeo(value: string | null): string | null {
  if (!value) return null;
  try {
    const text = decodeURIComponent(value).trim();
    return /^[\p{L} .'-]{1,40}$/u.test(text) ? text : null;
  } catch {
    return null;
  }
}
