import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoWordmark } from "@/components/Logo";
import BrokerMessagesLink from "@/components/messages/BrokerMessagesLink";

// Minimal top bar for the broker/dealer portal (/broker/*). Deliberately has
// no shopper-facing nav (no "Browse deals", no consumer sign up/login) — the
// broker dashboard already renders its own business-name + sign-out block,
// so this is just a small logo strip to anchor the portal visually, plus a
// way back to the main site.
export default function BrokerHeader() {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link
          href="/broker/dashboard"
          aria-label="Drive dealer & broker portal"
          className="-m-1 flex items-center gap-3 rounded-lg p-1 pointer-coarse:-my-2.5 pointer-coarse:py-2.5"
        >
          <LogoWordmark decorative className="h-6 w-auto text-fg" />
          <span aria-hidden="true" className="hidden h-4 w-px bg-line-strong sm:block" />
          <span className="hidden text-[13px] font-medium text-fg-muted sm:inline">
            Dealer &amp; broker portal
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/" className="btn btn-ghost btn-sm">
            <ArrowLeft /> Back to main site
          </Link>
          <BrokerMessagesLink />
          <Link href="/contact" className="btn btn-ghost btn-sm hidden sm:inline-flex">
            Need help?
          </Link>
        </div>
      </div>
    </header>
  );
}
