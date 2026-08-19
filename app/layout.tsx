import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { type HeaderAccount } from "@/components/SiteHeader";
import SiteChrome from "@/components/SiteChrome";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { withTimeout } from "@/lib/supabase/with-timeout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Compare Dealer & Broker Lease Deals`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Compare Dealer & Broker Lease Deals`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Compare Dealer & Broker Lease Deals`,
    description: SITE_DESCRIPTION,
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
      supabase.from("brokers").select("business_name").eq("id", user.id).single<{ business_name: string }>(),
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
        .single<{ first_name: string }>(),
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-black antialiased`}
    >
      <body className="flex min-h-full flex-col bg-black text-white">
        <SiteChrome account={account}>{children}</SiteChrome>
      </body>
    </html>
  );
}
