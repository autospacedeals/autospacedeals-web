"use client";

// The back link on a public deal page: "Back to your search" (filters and
// sort put back) when the shopper came from a filtered homepage, alongside
// "All deals"; otherwise just "Back to all deals". The search lives in
// sessionStorage (see LAST_SEARCH_KEY), so the server renders the plain link
// and this swaps in once hydrated.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LAST_SEARCH_KEY, RETURN_TO_SEARCH_HREF } from "@/lib/saved-searches";

export default function DealBackLinks() {
  const [hasSearch, setHasSearch] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasSearch(!!sessionStorage.getItem(LAST_SEARCH_KEY));
    } catch {
      // Ignore — just the plain link.
    }
  }, []);

  if (!hasSearch) {
    return (
      <Link href="/#deals" className="link-arrow mb-6 min-h-9">
        <ArrowLeft /> Back to all deals
      </Link>
    );
  }
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-1">
      <Link href={RETURN_TO_SEARCH_HREF} className="link-arrow min-h-9">
        <ArrowLeft /> Back to your search
      </Link>
      <Link href="/#deals" className="link-quiet inline-flex min-h-9 items-center text-[13px] font-medium">
        All deals
      </Link>
    </div>
  );
}
