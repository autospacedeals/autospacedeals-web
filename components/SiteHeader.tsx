"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, ChevronRight } from "lucide-react";
import { headerSignOutAction } from "@/app/actions";
import { LogoWordmark } from "@/components/Logo";

// Shopper destinations only — the broker portal (/broker/login,
// /broker/join-7k2m) is deliberately not linked anywhere on the consumer
// site; brokers get its links directly. The calculators deliberately aren't in
// the nav — they're reached from the guide, so Guide stays marked current
// on /calculator and /lease-end too. `match` decides which link is current.
const NAV_LINKS = [
  { href: "/#deals", label: "Deals", match: (p: string) => p === "/" || p.startsWith("/deals/") },
  {
    href: "/leasing-guide",
    label: "Guide",
    match: (p: string) =>
      p.startsWith("/leasing-guide") || p.startsWith("/calculator") || p.startsWith("/lease-end"),
  },
];

// The signed-in label + destination in the header — a broker sees their
// business name and lands in their dashboard, the admin account sees
// "Admin" and lands in the submission queue.
export interface HeaderAccount {
  label: string;
  href: string;
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default function SiteHeader({ account }: { account: HeaderAccount | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            aria-label="Drive — home"
            className="-m-1 shrink-0 rounded-lg p-1 pointer-coarse:-my-2 pointer-coarse:py-2"
          >
            <LogoWordmark decorative className="h-7 w-auto text-fg" />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.match(pathname) ? "page" : undefined}
                className="nav-link pointer-coarse:py-3"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          {account ? (
            <>
              <Link
                href={account.href}
                className="btn btn-ghost btn-sm hidden min-w-0 shrink pl-1.5 sm:inline-flex"
              >
                <span aria-hidden="true" className="avatar size-6 text-[11px]">
                  {initials(account.label)}
                </span>
                <span className="max-w-40 truncate">{account.label}</span>
              </Link>
              <form action={headerSignOutAction} className="hidden sm:block">
                <button type="submit" className="btn btn-ghost btn-sm">
                  <LogOut /> Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm hidden sm:inline-flex">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm hidden sm:inline-flex">
                Sign up
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="btn btn-secondary btn-icon md:hidden"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-line bg-overlay/95 backdrop-blur-xl md:hidden">
          <nav aria-label="Mobile" className="container-page py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={link.match(pathname) ? "page" : undefined}
                className="flex h-12 items-center justify-between rounded-xl px-3 text-base font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg aria-[current=page]:text-fg"
              >
                {link.label}
                <ChevronRight size={16} aria-hidden="true" className="text-fg-faint" />
              </Link>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-4 pb-1">
              {account ? (
                <>
                  <Link href={account.href} onClick={() => setOpen(false)} className="btn btn-secondary">
                    <span className="truncate">{account.label}</span>
                  </Link>
                  <form action={headerSignOutAction}>
                    <button type="submit" onClick={() => setOpen(false)} className="btn btn-ghost w-full">
                      <LogOut /> Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)} className="btn btn-secondary">
                    Log in
                  </Link>
                  <Link href="/signup" onClick={() => setOpen(false)} className="btn btn-primary">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
