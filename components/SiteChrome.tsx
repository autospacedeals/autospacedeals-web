"use client";

import { usePathname } from "next/navigation";
import SiteHeader, { type HeaderAccount } from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import BrokerHeader from "./BrokerHeader";
import BrokerFooter from "./BrokerFooter";
import { CustomerSessionProvider } from "./CustomerSession";

// The broker/dealer portal (/broker/*) is intentionally not linked from the
// consumer site anymore — it gets its own minimal header/footer instead of
// the shopper-facing nav (browse deals, shopper sign up, etc.) so it reads
// as a separate back-office tool, not part of the main marketplace.
export default function SiteChrome({
  account,
  children,
}: {
  account: HeaderAccount | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Only the portal's own routes (/broker, /broker/*). A bare "/broker"
  // prefix check would also catch the public broker profiles
  // (/brokers/[id]), which are shopper-facing and get the consumer chrome.
  const isPortalRoute = pathname === "/broker" || pathname?.startsWith("/broker/");

  // Shopper-side session (saved deals, account email) for the consumer
  // site only — the portal has no use for it, so it's switched off there.
  // Switched off rather than left out: the provider is the root on every
  // route, so moving between the portal and the consumer site keeps the
  // header, footer and page mounted, as before it existed. Keyed on the
  // header account so signing in or out re-reads it.
  return (
    <CustomerSessionProvider
      enabled={!isPortalRoute}
      accountKey={account ? `${account.href}|${account.label}` : null}
    >
      {isPortalRoute ? (
        <>
          <BrokerHeader />
          <div className="flex-1">{children}</div>
          <BrokerFooter />
        </>
      ) : (
        <>
          <SiteHeader account={account} />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </>
      )}
    </CustomerSessionProvider>
  );
}
