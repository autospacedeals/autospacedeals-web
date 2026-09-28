// Saved deals (see supabase/migrations/0016_saved_deals.sql). SERVER-ONLY:
// reads through the signed-in customer's cookie session, so RLS scopes the
// query to that customer's own rows whatever id is passed. Saving and
// removing happen in the browser (components/CustomerSession.tsx) under
// the same RLS.
//
// Degrades gracefully: the site deploys before the owner runs the
// migration, so a missing table reports "unavailable" instead of throwing.
import type { Deal } from "@/lib/deals-data";
import { createClient } from "./server";
import { withTimeout } from "./with-timeout";
import { DEAL_COLUMNS, mapRowToDeal, type DealRow } from "./deals";

// How many of the most recently saved deals the dashboard shows.
export const SAVED_DEALS_LIST_LIMIT = 60;

export interface SavedDeals {
  // Newest saved first, published deals only.
  deals: Deal[];
  // Every published saved deal, including any past the list limit.
  total: number;
  // False when saved deals couldn't be read at all (e.g. the table doesn't
  // exist yet) — the dashboard shows a short notice instead of the list.
  available: boolean;
}

interface SavedDealJoinRow {
  created_at: string;
  // Many-to-one, so PostgREST embeds a single object; typed loosely and
  // normalized below rather than trusted.
  deals: DealRow | DealRow[] | null;
}

export async function getSavedDeals(customerId: string): Promise<SavedDeals> {
  const unavailable: SavedDeals = { deals: [], total: 0, available: false };
  try {
    const supabase = await createClient();
    // !inner + the status filter drops saved deals that have since been
    // unpublished or removed, rather than returning them with a null deal.
    const { data, error, count } = await withTimeout(
      supabase
        .from("saved_deals")
        .select(`created_at, deals!inner(${DEAL_COLUMNS})`, { count: "exact" })
        .eq("customer_id", customerId)
        .eq("deals.status", "published")
        .order("created_at", { ascending: false })
        .limit(SAVED_DEALS_LIST_LIMIT)
        .returns<SavedDealJoinRow[]>(),
      10000,
      "getSavedDeals"
    );

    if (error) {
      console.error("getSavedDeals failed:", error.code, error.message);
      return unavailable;
    }

    // Mapped one at a time so a single malformed row is skipped (and
    // logged) instead of taking the whole list down.
    const deals: Deal[] = [];
    for (const row of data ?? []) {
      const dealRow = Array.isArray(row?.deals) ? row.deals[0] : row?.deals;
      if (!dealRow || dealRow.status !== "published") continue;
      try {
        deals.push(mapRowToDeal(dealRow));
      } catch (err) {
        console.error("mapRowToDeal failed for saved deal", dealRow.id, err);
      }
    }
    return { deals, total: Math.max(count ?? 0, deals.length), available: true };
  } catch (err) {
    console.error("getSavedDeals threw:", err);
    return unavailable;
  }
}
