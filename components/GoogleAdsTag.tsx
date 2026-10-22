"use client";

// The Google Ads tag (gtag.js), so ad clicks that lead to sign-ups can be
// measured. Only on the live site's public pages, and never for a visitor
// who opted out or whose browser sends Global Privacy Control
// (lib/ad-privacy.ts; disclosed on /privacy).
import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { adsAllowed } from "@/lib/ad-privacy";

const GOOGLE_ADS_ID = "AW-18526303759";
// The "Page view" conversion action set up in Google Ads (its event snippet).
const PAGE_VIEW_CONVERSION = { send_to: `${GOOGLE_ADS_ID}/4tpXCJDt-aIdEI_sg4JF`, value: 1.0, currency: "USD" };
const LIVE_HOSTS = ["www.idriveus.com", "idriveus.com"];
const PRIVATE_PATHS = /^\/(admin|broker)(\/|$)/;

const noSubscribe = () => () => {};

export default function GoogleAdsTag() {
  const pathname = usePathname();
  // Read in the browser only (false while server-rendering); a change of
  // choice reloads the page, so nothing to subscribe to.
  const allowed = useSyncExternalStore(
    noSubscribe,
    () => LIVE_HOSTS.includes(location.hostname) && adsAllowed(),
    () => false
  );
  const active = allowed && !PRIVATE_PATHS.test(pathname ?? "");

  // The first page view is sent by the config script below; client-side
  // navigations don't reload it, so each later page sends its own.
  const firstPage = useRef(true);
  useEffect(() => {
    if (!active) return;
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.("event", "conversion", PAGE_VIEW_CONVERSION);
  }, [active, pathname]);

  if (!active) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} strategy="afterInteractive" />
      <Script id="google-ads-config" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');
gtag('event', 'conversion', ${JSON.stringify(PAGE_VIEW_CONVERSION)});`}
      </Script>
    </>
  );
}
