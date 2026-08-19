"use client";

import { usePathname } from "next/navigation";
import SiteHeader, { type HeaderAccount } from "./SiteHeader";
import SiteFooter from "./SiteFooter";
import BrokerHeader from "./BrokerHeader";
import BrokerFooter from "./BrokerFooter";

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
  const isBrokerPortal = pathname?.startsWith("/broker");

  if (isBrokerPortal) {
    return (
      <>
        <BrokerHeader />
        <div className="flex-1">{children}</div>
        <BrokerFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader account={account} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </>
  );
}
