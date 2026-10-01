"use client";

import { useState } from "react";
import { RefreshCw, Pause, Play, Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  toggleSheetSyncActiveAction,
  toggleSheetSyncAutoPublishAction,
  deleteSheetSyncAction,
} from "./actions";
import MyListings from "./MyListings";
import type { Deal } from "@/lib/deals-data";

export interface SheetSync {
  id: string;
  sheetUrl: string;
  autoPublish: boolean;
  active: boolean;
  lastSyncedAt: string | null;
  lastSyncAdded: number;
  lastSyncRemoved: number;
  lastSyncError: string | null;
}

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "Not checked yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not checked yet";
  const minsAgo = Math.round((Date.now() - d.getTime()) / 60000);
  if (minsAgo < 1) return "Just now";
  if (minsAgo < 60) return `${minsAgo} min ago`;
  const hoursAgo = Math.round(minsAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo} hr ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 40 ? `${u.hostname}${u.pathname.slice(0, 30)}…` : `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

// Lets a broker see and control every Google Sheet they've set to
// auto-sync — pause it, switch auto-publish on/off, or unlink it entirely —
// with the live cars that sheet created listed right under it, kept apart
// from cars added by hand. The actual recurring check runs server-side on a
// schedule (see app/api/cron/sync-sheets); this is just the control panel.
export default function SheetSyncManager({
  syncs,
  listingsBySync = {},
}: {
  syncs: SheetSync[];
  listingsBySync?: Record<string, Deal[]>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (syncs.length === 0) return null;

  async function run(id: string, action: () => Promise<{ error: string | null }>) {
    setBusyId(id);
    setError(null);
    const result = await action();
    if (result.error) setError(result.error);
    setBusyId(null);
  }

  return (
    <section className="mt-8">
      <h2 className="type-title">From your live Google Sheet</h2>
      <p className="mt-1 text-sm text-fg-secondary">
        Checked automatically for new, repriced, and removed cars. To change a price or take a
        car down, edit the sheet — deleted or crossed-out rows come off on the next check.
      </p>

      {error && (
        <p role="alert" className="alert alert-danger mt-3">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-8">
        {syncs.map((sync) => {
          const listings = listingsBySync[sync.id] ?? [];
          return (
            <div key={sync.id}>
              <div className="rounded-xl border border-line bg-hover p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a
                      href={sync.sheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link break-all text-sm"
                    >
                      {shortUrl(sync.sheetUrl)}
                    </a>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
                      <RefreshCw size={12} className="shrink-0" /> Last checked: {formatSyncedAt(sync.lastSyncedAt)}
                      {sync.lastSyncedAt &&
                        (sync.lastSyncAdded > 0 || sync.lastSyncRemoved > 0) &&
                        ` — added ${sync.lastSyncAdded}, removed ${sync.lastSyncRemoved}`}
                    </p>
                    {sync.lastSyncError && (
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {sync.lastSyncError}
                      </p>
                    )}
                    {!sync.active && (
                      <p className="pill pill-neutral mt-2">Paused</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === sync.id}
                      onClick={() => run(sync.id, () => toggleSheetSyncActiveAction(sync.id, !sync.active))}
                      className="btn btn-secondary btn-sm"
                    >
                      {busyId === sync.id ? (
                        <Loader2 className="animate-spin" />
                      ) : sync.active ? (
                        <Pause />
                      ) : (
                        <Play />
                      )}
                      {sync.active ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === sync.id}
                      onClick={() => run(sync.id, () => deleteSheetSyncAction(sync.id))}
                      className="btn btn-danger btn-sm"
                    >
                      <Trash2 /> Unlink
                    </button>
                  </div>
                </div>

                <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-xs text-fg-secondary has-[:disabled]:cursor-not-allowed">
                  <input
                    type="checkbox"
                    checked={sync.autoPublish}
                    disabled={busyId === sync.id}
                    onChange={(e) =>
                      run(sync.id, () => toggleSheetSyncAutoPublishAction(sync.id, e.target.checked))
                    }
                    className="checkbox"
                  />
                  Auto-publish new listings found on future checks (off = they land as drafts for you
                  to confirm)
                </label>
              </div>

              <p className="mt-4 mb-3 text-sm font-medium text-fg">
                {listings.length} live {listings.length === 1 ? "car" : "cars"} from this sheet
              </p>
              <MyListings
                deals={listings}
                emptyMessage={
                  sync.autoPublish
                    ? "No live cars from this sheet yet — new rows show up here after the next check."
                    : "No live cars from this sheet yet — new rows land in your drafts above after the next check."
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
