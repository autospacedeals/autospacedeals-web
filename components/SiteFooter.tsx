import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export default function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Image
              src="/logo-wordmark.png"
              alt="Drive"
              width={940}
              height={211}
              className="h-7 w-auto"
            />
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              One place to browse, compare, and contact dealers and brokers for real
              lease offers.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-300">Shop</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500">
              <li>
                <Link href="/#deals" className="hover:text-white">
                  Browse deals
                </Link>
              </li>
              <li>
                <Link href="/leasing-guide" className="hover:text-white">
                  Leasing guide
                </Link>
              </li>
              <li>
                <Link href="/#how" className="hover:text-white">
                  How it works
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-300">Dealers &amp; Brokers</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500">
              <li>
                <Link href="/broker/signup" className="hover:text-white">
                  List your deals
                </Link>
              </li>
              <li>
                <a
                  href="mailto:rob@idriveus.com?subject=Question%20about%20Drive"
                  className="hover:text-white"
                >
                  Contact support
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-300">Trust &amp; accuracy</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-500">
              <li className="flex items-start gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                <span>Verified badge = seller identity confirmed by our team.</span>
              </li>
              <li>
                <a
                  href="mailto:rob@idriveus.com?subject=Report%20an%20issue"
                  className="hover:text-white"
                >
                  Report an issue
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 space-y-2 border-t border-white/10 pt-6 text-xs leading-5 text-zinc-600">
          <p>
            All deals are subject to availability and credit approval. Advertised payments,
            due-at-signing amounts, and terms are provided by the listing dealer or broker and
            may not include tax unless stated. Title, registration, and documentation fees are
            included. Always confirm final pricing and terms directly with the dealer or broker
            before signing.
          </p>
          <p className="flex flex-wrap items-center gap-x-3">
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
      </div>
    </footer>
  );
}
