import Link from "next/link";

// Minimal footer for the broker/dealer portal — no shopper nav, just legal
// links and a copyright line.
export default function BrokerFooter() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-zinc-600">
          <span>© {new Date().getFullYear()} Drive. All rights reserved.</span>
          <Link href="/privacy" className="hover:text-zinc-400">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:text-zinc-400">
            Terms of Service
          </Link>
        </p>
      </div>
    </footer>
  );
}
