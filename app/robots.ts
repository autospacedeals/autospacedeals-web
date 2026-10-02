import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Account, back-office and one-off pages have nothing for search. The
      // whole broker portal stays out too — it's only reached by direct link.
      disallow: [
        "/admin",
        "/api",
        "/auth",
        "/alerts",
        "/customer",
        "/login",
        "/signup",
        "/broker/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
