import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found",
};

// Shown for any unknown URL and wherever a page calls notFound() — most
// often a deal that's been taken down or a broker profile that no longer
// exists. Without this, Next.js falls back to its bare white 404 screen.
export default function NotFound() {
  return (
    <main className="container-prose flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full border border-line-strong bg-raised text-fg-muted">
        <Search size={20} />
      </div>
      <h1 className="type-page mt-6 text-3xl sm:text-4xl">Page not found</h1>
      <p className="lede mt-4 max-w-md">
        This page doesn&apos;t exist anymore — if it was a deal, it may have been taken down by
        the seller.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <Link href="/#deals" className="btn btn-primary">
          Browse deals
        </Link>
        <Link href="/leasing-guide" className="btn btn-secondary">
          Leasing guide
        </Link>
      </div>
    </main>
  );
}
