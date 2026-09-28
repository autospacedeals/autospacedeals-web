import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Account, back-office and one-off pages have nothing for search.
      // /broker/signup stays crawlable so dealers can find it.
      disallow: [
        "/admin",
        "/api",
        "/auth",
        "/alerts",
        "/customer",
        "/login",
        "/signup",
        "/broker/dashboard",
        "/broker/login",
        "/broker/preview",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
