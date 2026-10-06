import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The old domain still points at this project; send every page to the
      // same path on idriveus.com.
      {
        source: "/:path*",
        has: [{ type: "host", value: "(www\\.)?autospacedeals\\.com" }],
        destination: "https://www.idriveus.com/:path*",
        permanent: true,
      },
      // There's no deals index page; the list lives on the homepage.
      { source: "/deals", destination: "/#deals", permanent: false },
      // Short link printed on business cards (QR code and typed). Tagged so
      // card visits show up as "business-card" on /admin/leads.
      { source: "/card", destination: "/?utm_source=business-card&utm_campaign=rob", permanent: false },
    ];
  },
};

export default nextConfig;
