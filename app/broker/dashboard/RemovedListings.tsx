"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Loader2 } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatDate } from "@/lib/deal-utils";
import { restoreDealAction } from "./actions";

function formatRemovedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// History of listings the broker has taken down. Kept as real rows (soft-
// deleted, not hard-deleted) specifically so this view — and the "when did
// this go up / come down" record — exists at all, and so a listing pulled
// by mistake can be brought back with one click instead of re-entering it
// from scratch.
export default function RemovedListings({ deals }: { deals: Deal[] }) {
  const [open, setOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (deals.length === 0) return null;

  async function handleRestore(id: string) {
    setRestoringId(id);
    setError(null);
    const result = await restoreDealAction(id);
    if (result.error) setError(result.error);
    setRestoringId(null);
  }

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-zinc-300">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Removed listings ({deals.length})
        </span>
        <span className="text-xs text-zinc-500">
          {open ? "Hide" : "Show"} — listings you&apos;ve taken down, with when they were listed and removed
        </span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-5 pb-5 pt-3">
          {error && (
            <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">Vehicle</th>
                  <th className="py-2 pr-3">Listed</th>
                  <th className="py-2 pr-3">Removed</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr key={deal.id} className="border-t border-white/5 text-zinc-300">
                    <td className="py-2.5 pr-3">{dealTitle(deal)}</td>
                    <td className="py-2.5 pr-3 text-zinc-400">{formatDate(deal.datePosted)}</td>
                    <td className="py-2.5 pr-3 text-zinc-400">{formatRemovedAt(deal.removedAt)}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRestore(deal.id)}
                        disabled={restoringId === deal.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {restoringId === deal.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
