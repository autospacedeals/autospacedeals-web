import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader, { type HeaderAccount } from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

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

async function getHeaderAccount(): Promise<HeaderAccount | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (isAdminEmail(user.email)) {
    return { label: "Admin", href: "/admin/submissions" };
  }

  const { data: broker } = await supabase
    .from("brokers")
    .select("business_name")
    .eq("id", user.id)
    .single<{ business_name: string }>();

  return { label: broker?.business_name ?? "My Dashboard", href: "/broker/dashboard" };
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
        <SiteHeader account={account} />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
