import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Uploads through forms (license / insurance photos, inventory
      // spreadsheets and screenshots). The default is 1MB; Vercel itself
      // stops at 4.5MB. Photos are shrunk in the browser first
      // (lib/shrink-image.ts); chat attachments go straight to storage.
      bodySizeLimit: "4mb",
    },
  },
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
