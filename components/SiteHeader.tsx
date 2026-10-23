"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogOut, ChevronRight, MessageSquare } from "lucide-react";
import { headerSignOutAction } from "@/app/actions";
import { UnreadBadge, useUnreadMessages } from "@/components/messages/UnreadMessages";
import Wordmark from "@/components/Wordmark";
import ThemeToggle from "@/components/ThemeToggle";

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
  // Shoppers and brokers each have an inbox (admin has its own page).
  const messagesHref =
    account?.href === "/customer/dashboard"
      ? "/customer/messages"
      : account?.href === "/broker/dashboard"
        ? "/broker/dashboard/messages"
        : null;
  const unread = useUnreadMessages(
    messagesHref === "/customer/messages" ? "customer" : messagesHref ? "broker" : null
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-xl">
      {/* Three columns on desktop: nav, the wordmark centred, account. On
          phones the wordmark moves to the left and the nav into the menu. */}
      <div className="container-page grid h-16 grid-cols-[auto_1fr] items-center gap-4 md:h-[4.5rem] md:grid-cols-[1fr_auto_1fr]">
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
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

        <Link
          href="/"
          aria-label="Drive — home"
          className="-m-1 shrink-0 justify-self-start rounded-[2px] p-1 text-fg pointer-coarse:-my-2 pointer-coarse:py-2 md:justify-self-center"
        >
          <Wordmark className="text-[19px] md:text-[23px]" />
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <ThemeToggle />
          {account ? (
            <>
              {messagesHref && (
                <Link
                  href={messagesHref}
                  aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
                  className="btn btn-ghost btn-icon btn-sm relative"
                >
                  <MessageSquare />
                  <UnreadBadge count={unread} className="absolute -top-1 -right-1" />
                </Link>
              )}
              <Link
                href={account.href}
                className="btn btn-secondary btn-pill btn-sm hidden min-w-0 shrink border-line-hover pl-1.5 sm:inline-flex"
              >
                <span aria-hidden="true" className="avatar size-6 text-[11px]">
                  {initials(account.label)}
                </span>
                <span className="max-w-40 truncate">{account.label}</span>
              </Link>
              {/* Icon only on tablets, where the header is tight. */}
              <form action={headerSignOutAction} className="hidden md:block">
                <button type="submit" aria-label="Sign out" className="btn btn-ghost btn-sm">
                  <LogOut /> <span className="hidden lg:inline">Sign out</span>
                </button>
              </form>
            </>
          ) : (
            // One way in, like Google's: the login page offers email,
            // Google, a text code, and a link to create an account.
            <Link href="/login" className="btn btn-primary btn-pill btn-sm">
              Sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="btn btn-icon btn-sm border-line-hover text-fg md:hidden"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-line bg-canvas md:hidden">
          <nav aria-label="Mobile" className="container-page py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={link.match(pathname) ? "page" : undefined}
                className="flex h-12 items-center justify-between border-b border-line px-1 text-base font-medium text-fg-secondary transition-colors hover:text-fg aria-[current=page]:text-fg"
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
                  {messagesHref && (
                    <Link href={messagesHref} onClick={() => setOpen(false)} className="btn btn-secondary col-span-2 row-start-2">
                      <MessageSquare /> Messages <UnreadBadge count={unread} />
                    </Link>
                  )}
                  <form action={headerSignOutAction}>
                    <button type="submit" onClick={() => setOpen(false)} className="btn btn-ghost w-full">
                      <LogOut /> Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)} className="btn btn-primary">
                    Sign in
                  </Link>
                  <Link href="/signup" onClick={() => setOpen(false)} className="btn btn-secondary">
                    Create an account
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
