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
export default function RemovedListings({ deals, asAdmin = false }: { deals: Deal[]; asAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (deals.length === 0) return null;

  async function handleRestore(id: string) {
    setRestoringId(id);
    setError(null);
    const result = await restoreDealAction(id, asAdmin);
    if (result.error) setError(result.error);
    setRestoringId(null);
  }

  return (
    <div className="card mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-12 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl px-5 py-4 text-left"
      >
        <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-fg-secondary">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          Removed listings ({deals.length})
        </span>
        <span className="text-xs text-fg-muted">
          {open ? "Hide" : "Show"} — listings you&apos;ve taken down, with when they were listed and removed
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-1 pb-1">
          {error && (
            <p role="alert" className="alert alert-danger mx-4 mt-4 px-3 py-2 text-xs leading-5">
              {error}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="table-drive min-w-[520px] [&_tbody_tr:last-child_td]:border-b-0">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Listed</th>
                  <th>Removed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr key={deal.id}>
                    <td>{dealTitle(deal)}</td>
                    <td>{formatDate(deal.datePosted)}</td>
                    <td>{formatRemovedAt(deal.removedAt)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => handleRestore(deal.id)}
                        disabled={restoringId === deal.id}
                        className="btn btn-secondary btn-sm"
                      >
                        {restoringId === deal.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RotateCcw />
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
