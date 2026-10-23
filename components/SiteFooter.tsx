import Link from "next/link";
import { MessageSquare, ShieldCheck } from "lucide-react";
import Wordmark from "@/components/Wordmark";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { href: "/#deals", label: "Browse deals" },
      { href: "/best-lease-deals", label: "This month's best deals" },
      { href: "/leases", label: "Deals by make & model" },
      { href: "/leasing-guide", label: "Leasing guide" },
      { href: "/customer/signup", label: "Create an account" },
    ],
  },
  {
    heading: "Your account",
    links: [
      { href: "/customer/dashboard", label: "Saved deals & alerts" },
      { href: "/customer/messages", label: "Messages" },
      { href: "/text-alerts", label: "Text alerts" },
    ],
  },
  {
    heading: "Help",
    links: [
      { href: "/about", label: "About Drive" },
      { href: "/faq", label: "How Drive works" },
      { href: "/contact", label: "Contact support" },
      { href: "/contact?topic=listing", label: "Report a listing" },
      // The broker portal itself stays off the consumer site; sellers ask here.
      { href: "/contact?topic=dealer", label: "List your deals on Drive" },
    ],
  },
];

// A dark band in both themes (.theme-dark), opening with the
// wordmark set large.
export default function SiteFooter() {
  return (
    <footer className="theme-dark mt-28 bg-[color-mix(in_srgb,var(--canvas)_78%,#000)] text-fg">
      <div className="container-page pt-16 pb-10 sm:pt-20">
        <div className="text-center">
          <Wordmark className="text-[clamp(3.5rem,14vw,13.5rem)] tracking-[0.2em]" />
          <p className="mt-4 font-serif text-lg text-fg-muted italic sm:text-xl">idriveus.com</p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line-strong pt-8 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <p className="label">The lease marketplace</p>
            <ul className="mt-4 max-w-xs space-y-2.5 font-serif text-[15.5px] leading-6 text-fg-secondary">
              <li className="flex items-start gap-2.5">
                <ShieldCheck size={16} className="mt-1 shrink-0 text-brand" />
                <span>Every deal is posted by the dealer or broker offering it.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MessageSquare size={16} className="mt-1 shrink-0 text-brand" />
                <span>Your number stays private until you choose to share it.</span>
              </li>
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="label">{col.heading}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-fg-secondary transition-colors hover:text-fg">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 space-y-3 border-t border-line-strong pt-8 text-xs leading-5 text-fg-muted">
          <p className="max-w-4xl">
            All deals are subject to availability and credit approval. Advertised payments,
            due-at-signing amounts, and terms are provided by the listing dealer or broker and
            may not include taxes, title, registration, or other fees unless the listing says so.
            Vehicle photos may be stock images and may not show the exact vehicle, color or
            options. Drive doesn&apos;t sell, lease, or finance vehicles. Always confirm final
            pricing and terms directly with the dealer or broker before signing.
          </p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} Drive · idriveus.com</span>
            <Link href="/privacy" className="link-quiet">
              Privacy Policy
            </Link>
            <Link href="/terms" className="link-quiet">
              Terms of Service
            </Link>
            <Link href="/privacy/choices" className="link-quiet">
              Do Not Sell or Share My Personal Information
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
