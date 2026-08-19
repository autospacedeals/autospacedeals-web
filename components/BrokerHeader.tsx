import Link from "next/link";
import Image from "next/image";

// Minimal top bar for the broker/dealer portal (/broker/*). Deliberately has
// no shopper-facing nav (no "Browse deals", no consumer sign up/login) — the
// broker dashboard already renders its own business-name + sign-out block,
// so this is just a small logo strip to anchor the portal visually.
export default function BrokerHeader() {
  return (
    <header className="border-b border-white/10 bg-zinc-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/broker/dashboard" className="flex items-center gap-3">
          <Image
            src="/logo-wordmark.png"
            alt="Drive"
            width={940}
            height={211}
            priority
            className="h-7 w-auto sm:h-8"
          />
          <span className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:inline">
            Dealer &amp; Broker Portal
          </span>
        </Link>
        <a
          href="mailto:rob@idriveus.com?subject=Broker%20portal%20help"
          className="text-xs font-semibold text-zinc-500 transition hover:text-white"
        >
          Need help?
        </a>
      </div>
    </header>
  );
}
