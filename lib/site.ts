// Central place for site-wide constants used in metadata, sitemap, and
// structured data. Update SITE_URL once the site has a real domain —
// everything else (sitemap, robots.txt, OpenGraph tags) reads from here.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.idriveus.com";

export const SITE_NAME = "Drive";

export const SITE_DESCRIPTION =
  "Browse, filter, and compare real car lease deals from dealers and brokers in one place, then contact the seller directly.";
