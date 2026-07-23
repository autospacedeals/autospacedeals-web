"use client";

import { useState } from "react";
import Link from "next/link";
import { Car, Menu, X, UserCircle2 } from "lucide-react";

const NAV_LINKS = [
  { href: "/#deals", label: "Deals" },
  { href: "/#how", label: "How it works" },
  { href: "/#brokers", label: "For Dealers & Brokers" },
  { href: "/leasing-guide", label: "Leasing Guide" },
];

// The signed-in label + destination in the header — a broker sees their
// business name and lands in their dashboard, the admin account sees
// "Admin" and lands in the submission queue.
export interface HeaderAccount {
  label: string;
  href: string;
}

export default function SiteHeader({ account }: { account: HeaderAccount | null }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-zinc-950 sm:h-10 sm:w-10 sm:rounded-2xl">
            <Car size={20} />
          </div>
          <div>
            <p className="text-base font-bold leading-tight tracking-tight sm:text-lg">
              AutoSpace Deals
            </p>
            <p className="hidden text-xs text-zinc-400 sm:block">
              Curated dealer &amp; broker lease deals
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-zinc-300 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {account ? (
            <Link
              href={account.href}
              className="hidden items-center gap-1.5 text-sm font-semibold text-zinc-300 transition hover:text-white sm:inline-flex"
            >
              <UserCircle2 size={16} /> {account.label}
            </Link>
          ) : (
            <Link
              href="/broker/login"
              className="hidden text-sm font-semibold text-zinc-300 transition hover:text-white sm:inline-block"
            >
              Broker Login
            </Link>
          )}
          <Link
            href="/broker/signup"
            className="hidden rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 sm:inline-block"
          >
            Submit a Deal
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="rounded-xl border border-white/10 p-2 text-zinc-300 transition hover:bg-white/10 md:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-zinc-950 px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1 text-sm">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </a>
            ))}
            {account ? (
              <Link
                href={account.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-3 text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                <UserCircle2 size={16} /> {account.label}
              </Link>
            ) : (
              <Link
                href="/broker/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                Broker Login
              </Link>
            )}
            <Link
              href="/broker/signup"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-lg bg-white px-3 py-3 text-center font-semibold text-zinc-950"
            >
              Submit a Deal
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
