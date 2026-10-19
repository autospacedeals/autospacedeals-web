import type { Metadata } from "next";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { getSavedSearchesAvailable } from "@/lib/supabase/saved-searches";
import HomeClient from "@/components/HomeClient";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { jsonLdScript } from "@/lib/lease-pages";

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
    areaServed: { "@type": "AdministrativeArea", name: "Southern California" },
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

export default async function HomePage() {
  // Neither throws: the availability check just says false (and logs) if
  // the saved-searches migration hasn't been run yet.
  const [deals, savedSearchesAvailable] = await Promise.all([
    getPublishedDeals(),
    getSavedSearchesAvailable(),
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ORGANIZATION_JSON_LD) }} />
      <HomeClient initialDeals={deals} savedSearchesAvailable={savedSearchesAvailable} />
    </>
  );
}
