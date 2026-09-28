"use client";

// The dashboard's saved searches (see lib/supabase/saved-searches.ts), each
// with a delete button. The list comes from the server; deleting calls a
// server action that re-renders the page, and until that lands the row
// shows as deleting so it can't be pressed twice. After a delete, focus
// moves to the next row's button (or the section heading when none are
// left), since the one that had it is gone, and a status region that's
// always mounted — even once the list is empty — says it worked.
import { useState, useTransition, type ReactNode } from "react";
import { CircleAlert, Trash2 } from "lucide-react";
import { deleteSavedSearchAction } from "@/app/customer/saved-searches-actions";

export interface SavedSearchListItem {
  id: string;
  label: string;
  // "Make: BMW · Body style: SUV", already worded on the server.
  summary: string;
  created: string;
  lastAlerted: string;
}

// Where focus goes when there's no row left to move to (the section's h2,
// which has tabIndex={-1} for this).
const HEADING_ID = "alerts-heading";

export default function SavedSearchesList({
  searches,
  intro,
  emptyState,
}: {
  searches: SavedSearchListItem[];
  // Shown above the list while there are searches, and instead of it once
  // there aren't.
  intro: ReactNode;
  emptyState: ReactNode;
}) {
  const [announcement, setAnnouncement] = useState("");

  const handleDeleted = (nextFocusId: string | null) => {
    setAnnouncement("Saved search deleted.");
    // After the re-render has removed the row.
    requestAnimationFrame(() => {
      const next = nextFocusId
        ? document.querySelector<HTMLElement>(`[data-saved-search-delete="${nextFocusId}"]`)
        : null;
      (next ?? document.getElementById(HEADING_ID))?.focus();
    });
  };

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {searches.length === 0 ? (
        emptyState
      ) : (
        <>
          {intro}
          <ul className="mt-5 divide-y divide-line border-t border-line">
            {searches.map((search, index) => (
              <SavedSearchRow
                key={search.id}
                search={search}
                // The row below, else the one above.
                nextFocusId={searches[index + 1]?.id ?? searches[index - 1]?.id ?? null}
                onDeleted={handleDeleted}
                onDeleteStart={() => setAnnouncement("")}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function SavedSearchRow({
  search,
  nextFocusId,
  onDeleted,
  onDeleteStart,
}: {
  search: SavedSearchListItem;
  nextFocusId: string | null;
  onDeleted: (nextFocusId: string | null) => void;
  onDeleteStart: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    if (pending) return;
    setError(null);
    onDeleteStart();
    startTransition(async () => {
      try {
        const result = await deleteSavedSearchAction(search.id);
        if (result.ok) onDeleted(nextFocusId);
        else setError(result.error);
      } catch (err) {
        console.error("deleteSavedSearchAction threw:", err);
        setError("We couldn't delete this saved search. Please try again.");
      }
    });
  };

  return (
    <li className="py-4" aria-busy={pending || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium wrap-anywhere text-fg">{search.label}</p>
          {search.summary && (
            <p className="mt-1 text-sm wrap-anywhere text-fg-secondary">{search.summary}</p>
          )}
          <p className="mt-1.5 text-xs text-fg-muted">
            Saved {search.created || "recently"} ·{" "}
            {search.lastAlerted ? `Last alert ${search.lastAlerted}` : "No alerts sent yet"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          aria-disabled={pending || undefined}
          aria-label={`${pending ? "Deleting" : "Delete"} saved search ${search.label}`}
          data-saved-search-delete={search.id}
          className="btn btn-ghost btn-sm -mr-2 shrink-0 px-3"
        >
          <Trash2 /> {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
      {error && (
        <p role="alert" className="alert alert-danger mt-3">
          <CircleAlert />
          {error}
        </p>
      )}
    </li>
  );
}
