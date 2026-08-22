// Kept separate from lib/supabase/deals.ts on purpose: this needs the
// session-authenticated Supabase client from ./server, which imports
// next/headers. deals.ts is imported by client components too (e.g.
// MyListings.tsx), and next/headers can't be pulled into a client bundle —
// doing that broke every production build until this got split out.
import type { Deal } from "@/lib/deals-data";
import { createClient } from "./server";
import { mapRowToDeal, DEAL_COLUMNS, type DealRow } from "./deals";

// Lets a broker preview one of their own deals — draft or published — before
// it's confirmed and live. Scopes to broker_id so a broker can only ever
// preview their own listings; RLS on the `deals` table is the actual
// enforcement, this is just the query that stays inside that boundary.
export async function getDealByIdForBroker(id: string, brokerId: string): Promise<Deal | undefined> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("deals")
      .select(DEAL_COLUMNS)
      .eq("id", id)
      .eq("broker_id", brokerId)
      .maybeSingle<DealRow>();

    if (error) {
      console.error("getDealByIdForBroker failed:", error.message);
      return undefined;
    }
    if (!data) return undefined;

    try {
      return mapRowToDeal(data);
    } catch (err) {
      console.error("mapRowToDeal failed for deal", data.id, err);
      return undefined;
    }
  } catch (err) {
    console.error("getDealByIdForBroker threw:", err);
    return undefined;
  }
}
