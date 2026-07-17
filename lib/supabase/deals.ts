// Server-side data layer for reading published deals from Supabase. Used by
// the public homepage, deal detail pages, and sitemap instead of a static
// import, so broker self-service edits (price changes, new listings,
// removals) show up on the live site immediately.
import type { Deal } from "@/lib/deals-data";
import { createClient as createAnonClient } from "@supabase/supabase-js";

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
  trim: string;
  body_style: string;
  fuel: string;
  exterior: string;
  interior: string;
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
  status: "draft" | "published";
  submission_id: string | null;
}

export function mapRowToDeal(row: DealRow): Deal {
  return {
    id: row.id,
    slug: row.slug,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    bodyStyle: row.body_style as Deal["bodyStyle"],
    fuel: row.fuel as Deal["fuel"],
    exterior: row.exterior,
    interior: row.interior,
    dealType: row.deal_type as Deal["dealType"],
    msrp: row.msrp ?? 0,
    sellingPrice: row.selling_price ?? 0,
    payment: row.payment,
    dueAtSigning: row.due_at_signing,
    term: row.term,
    milesPerYear: row.miles_per_year,
    apr: row.apr,
    sellerType: row.seller_type as Deal["sellerType"],
    sellerName: row.seller_name,
    sellerPhone: row.seller_phone,
    sellerEmail: row.seller_email,
    city: row.city,
    state: row.state,
    verified: row.verified,
    inStock: row.in_stock,
    popularity: row.popularity,
    datePosted: row.date_posted,
    badge: row.badge ?? undefined,
    notes: row.notes ?? "",
    packages: row.packages ?? [],
    images: row.images ?? [],
    sourceUrl: row.source_url ?? undefined,
    sample: row.sample,
    onePay: row.one_pay,
  };
}

const DEAL_COLUMNS =
  "id, slug, broker_id, year, make, model, trim, body_style, fuel, exterior, interior, " +
  "deal_type, msrp, selling_price, payment, due_at_signing, term, miles_per_year, apr, " +
  "seller_type, seller_name, seller_phone, seller_email, city, state, " +
  "verified, in_stock, popularity, date_posted, badge, notes, packages, images, " +
  "source_url, sample, one_pay, status, submission_id";

export async function getPublishedDeals(): Promise<Deal[]> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("status", "published")
    .order("date_posted", { ascending: false })
    .returns<DealRow[]>();

  if (error) {
    console.error("getPublishedDeals failed:", error.message);
    return [];
  }
  return (data ?? []).map(mapRowToDeal);
}

export async function getDealBySlugDb(slug: string): Promise<Deal | undefined> {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<DealRow>();

  if (error || !data) return undefined;
  return mapRowToDeal(data);
}
