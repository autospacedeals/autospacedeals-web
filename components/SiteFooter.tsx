import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LogoWordmark } from "@/components/Logo";

export default function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-line bg-canvas">
      <div aria-hidden="true" className="light-bar absolute inset-x-0 -top-px" />
      <div className="container-page pt-16 pb-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <LogoWordmark className="h-6 w-auto text-fg" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-fg-muted">
              One place to browse, compare, and contact dealers and brokers for real
              lease offers.
            </p>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-fg">Shop</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link href="/#deals" className="link-quiet">
                  Browse deals
                </Link>
              </li>
              <li>
                <Link href="/leasing-guide" className="link-quiet">
                  Leasing guide
                </Link>
              </li>
              <li>
                <Link href="/#how" className="link-quiet">
                  How it works
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-fg">Dealers &amp; brokers</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <Link href="/broker/signup" className="link-quiet">
                  List your deals
                </Link>
              </li>
              <li>
                <Link href="/contact" className="link-quiet">
                  Contact support
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-semibold text-fg">Trust &amp; accuracy</p>
            <ul className="mt-4 space-y-3 text-sm text-fg-muted">
              <li className="flex items-start gap-2 leading-6">
                <ShieldCheck size={16} className="mt-1 shrink-0 text-success" />
                <span>Every listing shows real contact info for the dealer or broker who posted it — you deal with them directly.</span>
              </li>
              <li>
                <a
                  href="mailto:rob@idriveus.com?subject=Report%20an%20issue"
                  className="link-quiet"
                >
                  Report an issue
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 space-y-3 border-t border-line pt-8 text-xs leading-5 text-fg-muted">
          <p className="max-w-4xl">
            All deals are subject to availability and credit approval. Advertised payments,
            due-at-signing amounts, and terms are provided by the listing dealer or broker and
            may not include tax unless stated. Title, registration, and documentation fees are
            included. Always confirm final pricing and terms directly with the dealer or broker
            before signing.
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} Drive. All rights reserved.</span>
            <Link href="/privacy" className="link-quiet">
              Privacy Policy
            </Link>
            <Link href="/terms" className="link-quiet">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
