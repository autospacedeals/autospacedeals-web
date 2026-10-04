import Link from "next/link";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { LogoWordmark } from "@/components/Logo";

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { href: "/#deals", label: "Browse deals" },
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
      { href: "/contact", label: "Contact support" },
      { href: "/contact?topic=listing", label: "Report a listing" },
      // The broker portal itself stays off the consumer site; sellers ask here.
      { href: "/contact?topic=dealer", label: "List your deals on Drive" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-line bg-canvas">
      <div aria-hidden="true" className="light-bar absolute inset-x-0 -top-px" />
      <div className="container-page pt-16 pb-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <LogoWordmark className="h-6 w-auto text-fg" />
            <p className="mt-4 max-w-xs text-sm leading-6 text-fg-muted">
              Compare real lease deals from dealers and brokers, side by side, then message the
              seller right here.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-fg-muted">
              <li className="flex items-start gap-2 leading-6">
                <ShieldCheck size={16} className="mt-1 shrink-0 text-success" />
                <span>Every deal is posted by the dealer or broker offering it.</span>
              </li>
              <li className="flex items-start gap-2 leading-6">
                <MessageSquare size={16} className="mt-1 shrink-0 text-accent-fg" />
                <span>Your number stays private until you choose to share it.</span>
              </li>
            </ul>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <p className="text-[13px] font-semibold text-fg">{col.heading}</p>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="link-quiet">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 space-y-3 border-t border-line pt-8 text-xs leading-5 text-fg-muted">
          <p className="max-w-4xl">
            All deals are subject to availability and credit approval. Advertised payments,
            due-at-signing amounts, and terms are provided by the listing dealer or broker and
            may not include taxes, title, registration, or other fees unless the listing says so.
            Drive doesn&apos;t sell, lease, or finance vehicles. Always confirm final pricing and
            terms directly with the dealer or broker before signing.
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
