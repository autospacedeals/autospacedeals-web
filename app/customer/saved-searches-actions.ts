"use server";

// Saved searches + email alerts: "Save this search" on the homepage
// (components/SaveSearchButton.tsx) and the delete buttons on the
// dashboard's alerts list. Everything that arrives here is client-supplied,
// so it's re-validated; who it's for always comes from the session inside
// lib/supabase/saved-searches.ts, and RLS enforces the same in the database.
import { revalidatePath } from "next/cache";
import { SAVED_SEARCH_QUERY_MAX, parseSavedSearchFilters } from "@/lib/saved-searches";
import { createSavedSearch, deleteSavedSearch } from "@/lib/supabase/saved-searches";

export type SaveSearchResult =
  | { ok: true; alreadySaved: boolean }
  | { ok: false; error: string };

export type DeleteSearchResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The homepage's current filters, exactly as the filter panel holds them.
// Unknown keys are dropped and every known one type- and bounds-checked
// before anything is stored; the label is generated here from the result.
export async function saveSearchAction(rawFilters: unknown): Promise<SaveSearchResult> {
  const filters = parseSavedSearchFilters(rawFilters);
  // The one limit a shopper can plausibly hit (the search box enforces it,
  // but a value could still arrive longer), so it gets its own message.
  const rawQuery = (rawFilters as { query?: unknown } | null)?.query;
  if (!filters && typeof rawQuery === "string" && rawQuery.length > SAVED_SEARCH_QUERY_MAX) {
    return {
      ok: false,
      error: `Shorten your search text to ${SAVED_SEARCH_QUERY_MAX} characters to save it.`,
    };
  }
  if (!filters) {
    return { ok: false, error: "These filters couldn't be saved. Reset them and try again." };
  }
  const result = await createSavedSearch(filters);
  if (result.ok) revalidatePath("/customer/dashboard");
  return result;
}

export async function deleteSavedSearchAction(rawId: unknown): Promise<DeleteSearchResult> {
  if (typeof rawId !== "string" || !UUID_RE.test(rawId)) {
    return { ok: false, error: "This saved search couldn't be found. Refresh the page and try again." };
  }
  const result = await deleteSavedSearch(rawId);
  if (result.ok) revalidatePath("/customer/dashboard");
  return result;
}
