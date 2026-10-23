// Which cars shoppers save (saved_deals), for the admin Leads page: the most
// saved listings and the latest saves, with who saved them and how they found
// Drive. The internal "test" seller and throwaway "(delete me)" sellers are
// left out. SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";
import { isInternalSeller, testCustomerIds } from "@/lib/test-accounts";

const HOUR = 60 * 60 * 1000;
const ROW_LIMIT = 5000;

interface SaveRow {
  created_at: string;
  customer_id: string;
  deal_id: string;
  deals: {
    slug: string;
    year: number;
    make: string;
    model: string;
    trim: string | null;
    payment: number;
    one_pay: boolean;
    due_at_signing: number;
    status: string;
    seller_name: string | null;
  } | null;
  customers: {
    first_name: string | null;
    last_name: string | null;
    zip_code: string | null;
    signup_source: string | null;
    signup_campaign: string | null;
  } | null;
}

export interface SavedCar {
  dealId: string;
  slug: string;
  title: string;
  seller: string;
  payment: number;
  onePay: boolean;
  dueAtSigning: number;
  live: boolean;
  saves: number;
  lastSaved: string;
}

export interface RecentSave {
  at: string;
  shopper: string;
  zip: string | null;
  source: string;
  dealId: string;
  slug: string;
  title: string;
  seller: string;
  live: boolean;
}

export interface SavedStats {
  total: number;
  shoppers: number;
  topCars: SavedCar[];
  recent: RecentSave[];
}


export async function getSavedStats(days: number | null): Promise<SavedStats> {
  const admin = createAdminClient();
  let query = admin
    .from("saved_deals")
    .select(
      "created_at, customer_id, deal_id, deals(slug, year, make, model, trim, payment, one_pay, due_at_signing, status, seller_name), customers(first_name, last_name, zip_code, signup_source, signup_campaign)"
    )
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);
  if (days) query = query.gte("created_at", new Date(Date.now() - days * 24 * HOUR).toISOString());
  const [{ data, error }, testIds] = await Promise.all([query.returns<SaveRow[]>(), testCustomerIds(admin)]);
  if (error) console.error("getSavedStats failed:", error.message);

  // Test shopper accounts and the internal test seller don't count.
  const rows = (data ?? []).filter((r) => r.deals && !isInternalSeller(r.deals.seller_name) && !testIds.has(r.customer_id));
  const title = (d: NonNullable<SaveRow["deals"]>) => [d.year, d.make, d.model, d.trim].filter(Boolean).join(" ");

  const byDeal = new Map<string, SavedCar>();
  for (const r of rows) {
    const d = r.deals!;
    const car = byDeal.get(r.deal_id);
    if (car) {
      car.saves++;
      continue;
    }
    byDeal.set(r.deal_id, {
      dealId: r.deal_id,
      slug: d.slug,
      title: title(d),
      seller: d.seller_name ?? "",
      payment: d.payment,
      onePay: d.one_pay,
      dueAtSigning: d.due_at_signing,
      live: d.status === "published",
      saves: 1,
      lastSaved: r.created_at,
    });
  }

  return {
    total: rows.length,
    shoppers: new Set(rows.map((r) => r.customer_id)).size,
    topCars: [...byDeal.values()].sort((a, b) => b.saves - a.saves || (a.lastSaved < b.lastSaved ? 1 : -1)).slice(0, 25),
    recent: rows.slice(0, 25).map((r) => {
      const d = r.deals!;
      const c = r.customers;
      const shopper = c ? [c.first_name, c.last_name ? `${c.last_name.charAt(0)}.` : ""].filter(Boolean).join(" ") : "";
      return {
        at: r.created_at,
        shopper: shopper || "A shopper",
        zip: c?.zip_code ?? null,
        source: c?.signup_source ? [c.signup_source, c.signup_campaign].filter(Boolean).join(" · ") : "direct",
        dealId: r.deal_id,
        slug: d.slug,
        title: title(d),
        seller: d.seller_name ?? "",
        live: d.status === "published",
      };
    }),
  };
}
