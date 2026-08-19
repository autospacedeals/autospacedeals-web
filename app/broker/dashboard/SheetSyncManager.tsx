"use client";

import { useState } from "react";
import { RefreshCw, Pause, Play, Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  toggleSheetSyncActiveAction,
  toggleSheetSyncAutoPublishAction,
  deleteSheetSyncAction,
} from "./actions";

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
// auto-sync — pause it, switch auto-publish on/off, or unlink it entirely.
// The actual recurring check runs server-side on a schedule (see
// app/api/cron/sync-sheets); this is just the control panel for it.
export default function SheetSyncManager({ syncs }: { syncs: SheetSync[] }) {
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
    <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
      <h2 className="text-lg font-bold">Synced sheets</h2>
      <p className="mt-1 text-sm text-zinc-400">
        These Google Sheets get checked automatically every ~30 minutes for new or removed cars.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

      <div className="mt-4 space-y-3">
        {syncs.map((sync) => (
          <div key={sync.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={sync.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-semibold text-white hover:underline"
                >
                  {shortUrl(sync.sheetUrl)}
                </a>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                  <RefreshCw size={12} /> Last checked: {formatSyncedAt(sync.lastSyncedAt)}
                  {sync.lastSyncedAt &&
                    (sync.lastSyncAdded > 0 || sync.lastSyncRemoved > 0) &&
                    ` — added ${sync.lastSyncAdded}, removed ${sync.lastSyncRemoved}`}
                </p>
                {sync.lastSyncError && (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-300/80">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {sync.lastSyncError}
                  </p>
                )}
                {!sync.active && (
                  <p className="mt-1 text-xs font-semibold text-zinc-500">Paused</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === sync.id}
                  onClick={() => run(sync.id, () => toggleSheetSyncActiveAction(sync.id, !sync.active))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === sync.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : sync.active ? (
                    <Pause size={13} />
                  ) : (
                    <Play size={13} />
                  )}
                  {sync.active ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  disabled={busyId === sync.id}
                  onClick={() => run(sync.id, () => deleteSheetSyncAction(sync.id))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={13} /> Unlink
                </button>
              </div>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={sync.autoPublish}
                disabled={busyId === sync.id}
                onChange={(e) =>
                  run(sync.id, () => toggleSheetSyncAutoPublishAction(sync.id, e.target.checked))
                }
                className="rounded border-white/20 bg-white/5"
              />
              Auto-publish new listings found on future checks (off = they land as drafts for you
              to confirm)
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
