import type { MetadataRoute } from "next";
import { deals } from "@/lib/deals-data";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/leasing-guide`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/submit-a-deal`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  const dealRoutes: MetadataRoute.Sitemap = deals.map((deal) => ({
    url: `${SITE_URL}/deals/${deal.slug}`,
    lastModified: new Date(deal.datePosted),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...dealRoutes];
}
