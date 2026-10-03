import type { Metadata, Viewport } from "next";
import { Mona_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { type HeaderAccount } from "@/components/SiteHeader";
import SiteChrome from "@/components/SiteChrome";
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
  themeColor: "#07080a",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Compare Dealer & Broker Lease Deals`,
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

    if (isAdminEmail(user.email)) {
      return { label: "Admin", href: "/admin/submissions" };
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
    <html lang="en" className={`${monaSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-fg">
        <SiteChrome account={account}>{children}</SiteChrome>
      </body>
    </html>
  );
}
