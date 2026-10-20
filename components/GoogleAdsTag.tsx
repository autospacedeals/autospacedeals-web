"use client";

// The Google Ads tag (gtag.js), so ad clicks that lead to sign-ups can be
// measured. Only on the live site's public pages, and never for a visitor
// who opted out or whose browser sends Global Privacy Control
// (lib/ad-privacy.ts; disclosed on /privacy).
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { adsAllowed } from "@/lib/ad-privacy";

const GOOGLE_ADS_ID = "AW-18526303759";
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

  if (!allowed || PRIVATE_PATHS.test(pathname ?? "")) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} strategy="afterInteractive" />
      <Script id="google-ads-config" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');`}
      </Script>
    </>
  );
}
