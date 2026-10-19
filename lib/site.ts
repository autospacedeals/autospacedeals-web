// Central place for site-wide constants used in metadata, sitemap, and
// structured data. Update SITE_URL once the site has a real domain —
// everything else (sitemap, robots.txt, OpenGraph tags) reads from here.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.idriveus.com";

export const SITE_NAME = "Drive";

export const SITE_DESCRIPTION =
  "Compare real car lease deals from Southern California dealers and brokers in one place — monthly payment, due at signing and terms side by side — then message the seller directly.";

// Per-page metadata with matching share previews and a canonical URL.
// Next.js doesn't deep-merge `openGraph` from the layout, so each page sets
// the whole thing — otherwise every page shares as the homepage.
export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website" as const, siteName: SITE_NAME, title: `${title} | ${SITE_NAME}`, description, url: path },
    twitter: { card: "summary_large_image" as const, title: `${title} | ${SITE_NAME}`, description },
  };
}
