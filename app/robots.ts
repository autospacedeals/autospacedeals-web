import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      // The sign-in pages stay crawlable: they carry a noindex tag, and
      // Google can only drop a page from results if it's allowed to read
      // that tag (blocked pages were showing up as bare "Sign In" results).
      // /login and /signup just redirect to them.
      allow: ["/", "/customer/login", "/customer/signup", "/customer/forgot-password"],
      // Account, back-office and one-off pages have nothing for search. The
      // whole broker portal stays out too — it's only reached by direct link.
      disallow: ["/admin", "/api", "/auth", "/alerts", "/customer/", "/broker/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
