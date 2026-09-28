// Saved searches + email alerts (see supabase/migrations/0017_saved_searches.sql).
// SERVER-ONLY: reads and writes through the signed-in customer's cookie
// session, so RLS scopes every query to that customer's own rows whatever
// id is passed — and the customer is always taken from the session, never
// from the request. Validation and wording live in lib/saved-searches.ts
// (client-safe). The hourly alert job and the unsubscribe page use the
// service role instead; see app/api/cron/search-alerts and app/alerts.
//
// Degrades gracefully: the site deploys before the owner runs the
// migration, so a missing table reports "unavailable" instead of throwing.
import { createClient as createAnonClient } from "@supabase/supabase-js";
import type { DealFilters } from "@/lib/deal-utils";
import {
  SAVED_SEARCHES_PER_CUSTOMER,
  SAVED_SEARCH_LABEL_MAX,
  hasActiveFilters,
  parseSavedSearchFilters,
  savedSearchKey,
  savedSearchLabel,
} from "@/lib/saved-searches";
import { createClient } from "./server";
import { withTimeout } from "./with-timeout";

export interface SavedSearch {
  id: string;
  label: string;
  filters: DealFilters;
  createdAt: string;
  lastAlertedAt: string | null;
}

export interface SavedSearches {
  // Newest first.
  searches: SavedSearch[];
  // False when saved searches couldn't be read at all (e.g. the table
  // doesn't exist yet) — the dashboard shows a short notice instead.
  available: boolean;
}

export type CreateSavedSearchResult =
  | { ok: true; alreadySaved: boolean }
  | { ok: false; error: string };

export type DeleteSavedSearchResult = { ok: true } | { ok: false; error: string };

interface SavedSearchRow {
  id: string;
  filters: unknown;
  label: string | null;
  created_at: string;
  last_alerted_at: string | null;
}

// Postgres/PostgREST codes for "that table or column doesn't exist" — the
// migration hasn't been run yet.
export function isMissingRelationError(code: string | undefined): boolean {
  return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205";
}

const UNAVAILABLE_ERROR = "Saved searches aren't available yet. Please try again later.";
const GENERIC_SAVE_ERROR = "We couldn't save this search. Please try again.";
const NOT_CUSTOMER_ERROR = "Saved searches are for customer accounts. Log in with your customer account to save one.";
const SIGNED_OUT_ERROR = "Your session has ended. Log in again to save this search.";

function publicClient() {
  return createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Whether the saved_searches table exists at all, so the homepage can hide
// "Save this search" until the migration has been run. RLS returns no rows
// to an anonymous reader, so this only ever tells "there" from "not there".
export async function getSavedSearchesAvailable(): Promise<boolean> {
  try {
    const { error } = await withTimeout(
      publicClient().from("saved_searches").select("id").limit(1),
      4000,
      "getSavedSearchesAvailable"
    );
    if (error) {
      console.error("getSavedSearchesAvailable failed:", error.code, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("getSavedSearchesAvailable threw:", err);
    return false;
  }
}

function mapRow(row: SavedSearchRow): SavedSearch | null {
  const filters = parseSavedSearchFilters(row?.filters);
  if (!row?.id || !filters) return null;
  return {
    id: row.id,
    label: row.label?.trim() || savedSearchLabel(filters),
    filters,
    createdAt: row.created_at,
    lastAlertedAt: row.last_alerted_at,
  };
}

export async function getSavedSearches(customerId: string): Promise<SavedSearches> {
  const unavailable: SavedSearches = { searches: [], available: false };
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase
        .from("saved_searches")
        .select("id, filters, label, created_at, last_alerted_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(SAVED_SEARCHES_PER_CUSTOMER * 2)
        .returns<SavedSearchRow[]>(),
      10000,
      "getSavedSearches"
    );
    if (error) {
      console.error("getSavedSearches failed:", error.code, error.message);
      return unavailable;
    }
    // A row whose filters no longer validate is skipped (and logged)
    // rather than taking the whole list down.
    const searches: SavedSearch[] = [];
    for (const row of data ?? []) {
      const search = mapRow(row);
      if (search) searches.push(search);
      else console.error("getSavedSearches skipped an unreadable saved search", row?.id);
    }
    return { searches, available: true };
  } catch (err) {
    console.error("getSavedSearches threw:", err);
    return unavailable;
  }
}

// Saves a search for the signed-in customer. Callers pass filters already
// run through parseSavedSearchFilters(); a label, if given, is trimmed and
// capped (the "Get matched" flow names its searches after a deal),
// otherwise one is generated from the filters. Saving the same filters
// twice doesn't add a second row.
export async function createSavedSearch(
  filters: DealFilters,
  label?: string
): Promise<CreateSavedSearchResult> {
  const valid = parseSavedSearchFilters(filters);
  if (!valid) return { ok: false, error: "These filters couldn't be saved. Reset them and try again." };
  if (!hasActiveFilters(valid)) {
    return { ok: false, error: "Set at least one filter before saving a search." };
  }
  const name = (label?.trim() || savedSearchLabel(valid)).slice(0, SAVED_SEARCH_LABEL_MAX);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), 5000, "getUser");
    if (!user) return { ok: false, error: SIGNED_OUT_ERROR };

    const [customerResult, existingResult] = await Promise.all([
      withTimeout(
        supabase.from("customers").select("id").eq("id", user.id).maybeSingle<{ id: string }>(),
        5000,
        "createSavedSearch customer"
      ),
      withTimeout(
        supabase
          .from("saved_searches")
          .select("id, filters")
          .eq("customer_id", user.id)
          .limit(SAVED_SEARCHES_PER_CUSTOMER * 2)
          .returns<{ id: string; filters: unknown }[]>(),
        5000,
        "createSavedSearch existing"
      ),
    ]);

    if (customerResult.error) {
      console.error("createSavedSearch customer lookup failed:", customerResult.error.message);
      return { ok: false, error: GENERIC_SAVE_ERROR };
    }
    // Brokers and admins sign in with the same auth but have no customers
    // row (the foreign key would refuse them anyway).
    if (!customerResult.data) return { ok: false, error: NOT_CUSTOMER_ERROR };

    if (existingResult.error) {
      console.error("createSavedSearch existing lookup failed:", existingResult.error.code, existingResult.error.message);
      return {
        ok: false,
        error: isMissingRelationError(existingResult.error.code) ? UNAVAILABLE_ERROR : GENERIC_SAVE_ERROR,
      };
    }
    const existing = existingResult.data ?? [];
    const key = savedSearchKey(valid);
    if (
      existing.some((row) => {
        const saved = parseSavedSearchFilters(row?.filters);
        return saved !== null && savedSearchKey(saved) === key;
      })
    ) {
      return { ok: true, alreadySaved: true };
    }
    if (existing.length >= SAVED_SEARCHES_PER_CUSTOMER) {
      return {
        ok: false,
        error: `You can save up to ${SAVED_SEARCHES_PER_CUSTOMER} searches. Delete one from your dashboard to save another.`,
      };
    }

    const { error } = await withTimeout(
      supabase.from("saved_searches").insert({ customer_id: user.id, filters: valid, label: name }),
      10000,
      "createSavedSearch insert"
    );
    if (error) {
      console.error("createSavedSearch insert failed:", error.code, error.message);
      if (isMissingRelationError(error.code)) return { ok: false, error: UNAVAILABLE_ERROR };
      // The 0017 trigger's per-customer cap (a race with another tab).
      if (error.code === "23514") {
        return {
          ok: false,
          error: `You can save up to ${SAVED_SEARCHES_PER_CUSTOMER} searches. Delete one from your dashboard to save another.`,
        };
      }
      if (error.code === "42501" || error.code === "23503") return { ok: false, error: NOT_CUSTOMER_ERROR };
      return { ok: false, error: GENERIC_SAVE_ERROR };
    }
    return { ok: true, alreadySaved: false };
  } catch (err) {
    console.error("createSavedSearch threw:", err);
    return { ok: false, error: GENERIC_SAVE_ERROR };
  }
}

// Deletes one of the signed-in customer's saved searches. Scoped to the
// session's own rows twice over: the customer_id filter here, and RLS.
export async function deleteSavedSearch(id: string): Promise<DeleteSavedSearchResult> {
  const failure = "We couldn't delete this saved search. Please try again.";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), 5000, "getUser");
    if (!user) return { ok: false, error: "Your session has ended. Log in again to manage your alerts." };

    const { error } = await withTimeout(
      supabase.from("saved_searches").delete().eq("id", id).eq("customer_id", user.id),
      10000,
      "deleteSavedSearch"
    );
    if (error) {
      console.error("deleteSavedSearch failed:", error.code, error.message);
      return { ok: false, error: isMissingRelationError(error.code) ? UNAVAILABLE_ERROR : failure };
    }
    // Deleting a row that's already gone (another tab) is still the
    // outcome that was asked for.
    return { ok: true };
  } catch (err) {
    console.error("deleteSavedSearch threw:", err);
    return { ok: false, error: failure };
  }
}
