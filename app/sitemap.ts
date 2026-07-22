import type { MetadataRoute } from "next";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const deals = await getPublishedDeals();
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

  const brokerIds = Array.from(new Set(deals.map((d) => d.brokerId).filter((id): id is string => Boolean(id))));
  const brokerRoutes: MetadataRoute.Sitemap = brokerIds.map((id) => ({
    url: `${SITE_URL}/brokers/${id}`,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...dealRoutes, ...brokerRoutes];
}
