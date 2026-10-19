import type { MetadataRoute } from "next";
import { getPublishedDeals } from "@/lib/supabase/deals";
import { SITE_URL } from "@/lib/site";
import { catalog, makePath, modelPath } from "@/lib/lease-pages";

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
    ...["/calculator", "/lease-end", "/contact", "/text-alerts", "/privacy", "/terms"].map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
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

  // Browse-by-car pages (app/leases): every make and model with live deals.
  const makes = catalog(deals);
  const leaseRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/leases`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    ...makes.flatMap((m) => [
      { url: `${SITE_URL}${makePath(m.make)}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.8 },
      ...m.models.map((mo) => ({
        url: `${SITE_URL}${modelPath(m.make, mo.model)}`,
        lastModified: new Date(),
        changeFrequency: "daily" as const,
        priority: 0.8,
      })),
    ]),
  ];

  return [...staticRoutes, ...leaseRoutes, ...dealRoutes, ...brokerRoutes];
}
