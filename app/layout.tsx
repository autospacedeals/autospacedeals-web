import type { Metadata, Viewport } from "next";
import { Mona_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { type HeaderAccount } from "@/components/SiteHeader";
import SiteChrome from "@/components/SiteChrome";
import VisitTracker from "@/components/VisitTracker";
import GoogleAdsTag from "@/components/GoogleAdsTag";

// Applies the visitor's saved theme (components/ThemeToggle.tsx) before the
// first paint. Everyone starts in dark; light only once they pick it.
const THEME_SCRIPT = `try{if(localStorage.getItem("drive-theme")==="light"){document.documentElement.dataset.theme="light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#f4f6fb")}}catch(e){}`;
import SeenPing from "@/components/SeenPing";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { withTimeout } from "@/lib/supabase/with-timeout";

// Mona Sans is both the UI face and (semi-expanded, wdth 112) the display
// face — one variable file. The width axis must be requested explicitly.
const monaSans = Mona_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-mona",
  display: "swap",
});

// Formulas (leasing guide) and step numbers only.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#060a14",
  colorScheme: "dark light",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Compare Car Lease Deals in Southern California`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // Pages set their own title/description/url for share previews (see
  // pageMetadata in lib/site.ts) — only the shared bits live here.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
  },
  // Google Search Console and Bing Webmaster Tools ownership
  // (https://www.idriveus.com/). Keep both: removing one un-verifies the site.
  verification: {
    google: "fG-ytbKFzicfWYizBzrr1OnqRrAOv6yKuKQ4bu_hkbw",
    other: { "msvalidate.01": "F410CC2E8F2BEADB2F666669D5CD37AA" },
  },
};

// Runs on every page load (root layout), so a hang here would freeze the
// entire site's header — wrapped in a timeout + try/catch (same pattern as
// the broker-profile hang fixed earlier) so a slow/failed lookup degrades to
// "My Dashboard" instead of taking the whole page down or silently making
// the header link unusable.
async function getHeaderAccount(): Promise<HeaderAccount | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), 5000, "getUser");
    if (!user) return null;

    if (await isAdminEmail(user.email)) {
      return { label: "Admin", href: "/admin" };
    }

    const { data: broker, error } = await withTimeout(
      supabase.from("brokers").select("business_name").eq("id", user.id).maybeSingle<{ business_name: string }>(),
      5000,
      "getHeaderAccount broker lookup"
    );
    if (broker) return { label: broker.business_name, href: "/broker/dashboard" };
    if (error) {
      console.error("getHeaderAccount broker lookup failed:", error.message);
    }

    const { data: customer, error: customerError } = await withTimeout(
      supabase
        .from("customers")
        .select("first_name")
        .eq("id", user.id)
        .maybeSingle<{ first_name: string }>(),
      5000,
      "getHeaderAccount customer lookup"
    );
    if (customerError) {
      console.error("getHeaderAccount customer lookup failed:", customerError.message);
    }

    return { label: customer?.first_name ?? "My Account", href: "/customer/dashboard" };
  } catch (err) {
    console.error("getHeaderAccount threw:", err);
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const account = await getHeaderAccount();

  return (
    // suppressHydrationWarning: THEME_SCRIPT sets data-theme on <html> before
    // React loads.
    <html
      lang="en"
      className={`${monaSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-fg">
        <SiteChrome account={account}>{children}</SiteChrome>
        <VisitTracker />
        <GoogleAdsTag />
        {account && <SeenPing />}
      </body>
    </html>
  );
}
