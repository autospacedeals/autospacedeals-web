// Server-side data layer for reading published deals from Supabase. Used by
// the public homepage, deal detail pages, and sitemap instead of a static
// import, so broker self-service edits (price changes, new listings,
// removals) show up on the live site immediately.
import type { Deal } from "@/lib/deals-data";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient as createAuthedClient } from "./server";
import { withTimeout } from "./with-timeout";

// Shown when a broker hasn't uploaded a photo and the CarsXE auto-lookup
// (see lib/carsxe.ts) didn't find a match either.
export const PLACEHOLDER_IMAGE = "/cars/placeholder.svg";

// A plain anon-key client (no cookies/session needed) — public deal data is
// readable by anyone per the "Anyone can view published deals" RLS policy.
function publicClient() {
  return createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Raw shape of a row in the `deals` table (snake_case, as Postgres returns
// it) — mapped to the camelCase `Deal` type the rest of the app expects.
export interface DealRow {
  id: string;
  slug: string;
  broker_id: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  body_style: string | null;
  fuel: string | null;
  exterior: string | null;
  interior: string | null;
  deal_type: string;
  msrp: number | null;
  selling_price: number | null;
  payment: number;
  due_at_signing: number;
  term: number;
  miles_per_year: number | null;
  apr: number | null;
  seller_type: string;
  seller_name: string;
  seller_dealership: string | null;
  seller_phone: string;
  seller_email: string;
  city: string;
  state: string;
  verified: boolean;
  in_stock: boolean;
  popularity: number;
  date_posted: string;
  badge: string | null;
  notes: string | null;
  packages: string[] | null;
  images: string[] | null;
  source_url: string | null;
  sample: boolean;
  one_pay: boolean;
  status: "draft" | "published" | "removed";
  submission_id: string | null;
  condition: string | null;
  incentives: { name: string; amount: number; includedInPrice?: boolean }[] | null;
  photo_auto_sourced: boolean;
  due_at_signing_tax_rate: number | null;
  payment_tax_rate: number | null;
  mask_msrp: boolean;
  msrp_masked_label: string | null;
  broker_fee: number | null;
  removed_at: string | null;
}

export function mapRowToDeal(row: DealRow): Deal {
  return {
    id: row.id,
    slug: row.slug,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim ?? "",
    bodyStyle: (row.body_style as Deal["bodyStyle"]) ?? null,
    fuel: (row.fuel as Deal["fuel"]) ?? null,
    exterior: row.exterior ?? "",
    interior: row.interior ?? "",
    dealType: (row.deal_type as Deal["dealType"]) ?? "Lease",
    msrp: row.msrp ?? 0,
    sellingPrice: row.selling_price,
    // These are typed as required numbers, but nothing at the DB level
    // actually guarantees a non-null value ends up here — coalesce so a
    // stray null doesn't crash every formatCurrency() call downstream.
    payment: row.payment ?? 0,
    dueAtSigning: row.due_at_signing ?? 0,
    term: row.term ?? 0,
    milesPerYear: row.miles_per_year,
    apr: row.apr,
    sellerType: row.seller_type as Deal["sellerType"],
    sellerName: row.seller_name,
    sellerDealership: row.seller_dealership,
    sellerPhone: row.seller_phone,
    sellerEmail: row.seller_email,
    city: row.city,
    state: row.state,
    brokerId: row.broker_id,
    verified: row.verified,
    inStock: row.in_stock,
    popularity: row.popularity,
    datePosted: row.date_posted,
    badge: row.badge ?? undefined,
    notes: row.notes ?? "",
    packages: row.packages ?? [],
    images: row.images && row.images.length > 0 ? row.images : [PLACEHOLDER_IMAGE],
    sourceUrl: row.source_url ?? undefined,
    sample: row.sample,
    onePay: row.one_pay,
    condition: (row.condition as Deal["condition"]) ?? null,
    incentives: row.incentives ?? [],
    photoAutoSourced: row.photo_auto_sourced,
    dueAtSigningTaxRate: row.due_at_signing_tax_rate ?? null,
    paymentTaxRate: row.payment_tax_rate ?? null,
    maskMsrp: row.mask_msrp ?? false,
    msrpMaskedLabel: row.msrp_masked_label ?? null,
    brokerFee: row.broker_fee ?? null,
    status: row.status,
    removedAt: row.removed_at ?? null,
  };
}

const DEAL_COLUMNS =
  "id, slug, broker_id, year, make, model, trim, body_style, fuel, exterior, interior, " +
  "deal_type, msrp, selling_price, payment, due_at_signing, term, miles_per_year, apr, " +
  "seller_type, seller_name, seller_dealership, seller_phone, seller_email, city, state, " +
  "verified, in_stock, popularity, date_posted, badge, notes, packages, images, " +
  "source_url, sample, one_pay, status, submission_id, condition, incentives, photo_auto_sourced, " +
  "due_at_signing_tax_rate, payment_tax_rate, mask_msrp, msrp_masked_label, broker_fee, removed_at";

// Maps each row independently so one malformed row (bad test data, a
// future column-shape change, etc.) can't take down an entire listing page
// — the bad row is skipped and logged instead of throwing and crashing
// everything else on the page.
function mapRowsSafely(rows: DealRow[]): Deal[] {
  const deals: Deal[] = [];
  for (const row of rows) {
    try {
      deals.push(mapRowToDeal(row));
    } catch (err) {
      console.error("mapRowToDeal failed for deal", row?.id, err);
    }
  }
  return deals;
}

export async function getPublishedDeals(): Promise<Deal[]> {
  try {
    const supabase = publicClient();
    const { data, error } = await withTimeout(
      supabase
        .from("deals")
        .select(DEAL_COLUMNS)
        .eq("status", "published")
        .order("date_posted", { ascending: false })
        .returns<DealRow[]>(),
      10000,
      "getPublishedDeals"
    );

    if (error) {
      console.error("getPublishedDeals failed:", error.message);
      return [];
    }
    return mapRowsSafely(data ?? []);
  } catch (err) {
    console.error("getPublishedDeals threw:", err);
    return [];
  }
}

export async function getPublishedDealsByBroker(brokerId: string): Promise<Deal[]> {
  try {
    const supabase = publicClient();
    const { data, error } = await withTimeout(
      supabase
        .from("deals")
        .select(DEAL_COLUMNS)
        .eq("status", "published")
        .eq("broker_id", brokerId)
        .order("date_posted", { ascending: false })
        .returns<DealRow[]>(),
      10000,
      "getPublishedDealsByBroker"
    );

    if (error) {
      console.error("getPublishedDealsByBroker failed:", error.message);
      return [];
    }
    return mapRowsSafely(data ?? []);
  } catch (err) {
    console.error("getPublishedDealsByBroker threw:", err);
    return [];
  }
}

// Lets a broker preview one of their own deals — draft or published — before
// it's confirmed and live. Unlike the functions above, this uses the
// session-authenticated client (not the public anon client) and scopes to
// broker_id so a broker can only ever preview their own listings, published
// or not; RLS on the `deals` table is the actual enforcement, this is just
// the query that stays inside that boundary.
export async function getDealByIdForBroker(id: string, brokerId: string): Promise<Deal | undefined> {
  try {
    const supabase = await createAuthedClient();
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

export async function getDealBySlugDb(slug: string): Promise<Deal | undefined> {
  try {
    const supabase = publicClient();
    const { data, error } = await withTimeout(
      supabase
        .from("deals")
        .select(DEAL_COLUMNS)
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle<DealRow>(),
      10000,
      "getDealBySlugDb"
    );

    if (error) {
      console.error("getDealBySlugDb failed:", error.message);
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
    console.error("getDealBySlugDb threw:", err);
    return undefined;
  }
}
