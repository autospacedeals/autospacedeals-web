// Broker ratings & reviews (see supabase/migrations/0015_broker_reviews.sql).
// SERVER-ONLY: uses the cookie session and, for reviewer first names, the
// service-role client — import the client-safe bits from lib/reviews.ts.
//
// Reads are public (anon client, per the "Anyone can view broker reviews"
// RLS policy). Writes go through the signed-in customer's own session, so
// RLS scopes them to that customer no matter what the request claims.
// Every read degrades gracefully: the site deploys before the owner runs
// the migration, so a missing table must hide the reviews UI rather than
// break the broker profile or a deal page.
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient, createAdminClient } from "./server";
import { withTimeout } from "./with-timeout";
import { REVIEWS_LIST_LIMIT, REVIEW_TEXT_MAX } from "@/lib/reviews";

export interface BrokerReview {
  id: string;
  rating: number;
  text: string | null;
  updatedAt: string;
  reviewerFirstName: string;
}

export interface BrokerReviews {
  reviews: BrokerReview[];
  average: number | null;
  count: number;
  // False when reviews couldn't be read at all (e.g. the table doesn't
  // exist yet) — callers hide the whole reviews section and badge.
  available: boolean;
}

export interface BrokerRatingSummary {
  average: number | null;
  count: number;
}

export interface MyReview {
  rating: number;
  text: string | null;
  updatedAt: string;
}

// Who's looking at the review form, so the page can show the right thing:
// a login prompt, a note for broker/admin accounts, or the form itself
// (prefilled when this customer has already reviewed the broker).
export type ReviewViewer =
  | { status: "signed-out" }
  | { status: "own-profile" }
  | { status: "not-customer" }
  | { status: "unavailable" }
  | { status: "customer"; review: MyReview | null };

export type UpsertReviewResult = { ok: true } | { ok: false; error: string };

interface ReviewRow {
  id: string;
  customer_id: string;
  rating: number;
  review_text: string | null;
  updated_at: string;
}

// Shown when a reviewer's first name can't be looked up (service role
// unavailable, customer row gone, blank name).
const FALLBACK_REVIEWER_NAME = "Drive customer";

function publicClient() {
  return createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

function isValidRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

// Only ever the first word of the first name, capped — reviews are public,
// and the customers table itself stays private (own-row-only RLS).
function displayFirstName(raw: string | null | undefined): string {
  const first = String(raw ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? first.slice(0, 40) : FALLBACK_REVIEWER_NAME;
}

// Looks up first names for just these reviewers with the service role —
// the only way to read another customer's row. Selects first_name and
// nothing else. Any failure falls back to a generic name instead of
// hiding the reviews.
async function getReviewerFirstNames(customerIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (customerIds.length === 0) return names;
  try {
    const admin = createAdminClient();
    const { data, error } = await withTimeout(
      admin
        .from("customers")
        .select("id, first_name")
        .in("id", customerIds)
        .returns<{ id: string; first_name: string | null }[]>(),
      8000,
      "getReviewerFirstNames"
    );
    if (error) {
      console.error("getReviewerFirstNames failed:", error.message);
      return names;
    }
    for (const row of data ?? []) names.set(row.id, displayFirstName(row.first_name));
  } catch (err) {
    console.error("getReviewerFirstNames threw:", err);
  }
  return names;
}

// Light average + count for the deal page's trust badge (and the profile
// header). Null means "couldn't tell" — including before the migration has
// been run — and callers simply don't render a badge.
export async function getBrokerRatingSummary(brokerId: string): Promise<BrokerRatingSummary | null> {
  try {
    const supabase = publicClient();
    const { data, error } = await withTimeout(
      supabase
        .rpc("broker_rating_summary", { p_broker_id: brokerId })
        .returns<{ average: number | null; review_count: number | null }[]>(),
      8000,
      "getBrokerRatingSummary"
    );
    if (error) {
      console.error("getBrokerRatingSummary failed:", error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : null;
    const count = Number(row?.review_count ?? 0);
    const average = row?.average == null ? null : Number(row.average);
    if (!Number.isFinite(count) || count < 0) return null;
    return {
      count,
      average: count > 0 && average != null && Number.isFinite(average) ? average : null,
    };
  } catch (err) {
    console.error("getBrokerRatingSummary threw:", err);
    return null;
  }
}

// Everything the broker profile's reviews section needs: the newest
// reviews (with reviewer first names) plus the overall average and count.
export async function getReviewsForBroker(brokerId: string): Promise<BrokerReviews> {
  const unavailable: BrokerReviews = { reviews: [], average: null, count: 0, available: false };
  try {
    const supabase = publicClient();
    const [listResult, summary] = await Promise.all([
      withTimeout(
        supabase
          .from("broker_reviews")
          .select("id, customer_id, rating, review_text, updated_at")
          .eq("broker_id", brokerId)
          .order("updated_at", { ascending: false })
          .limit(REVIEWS_LIST_LIMIT)
          .returns<ReviewRow[]>(),
        10000,
        "getReviewsForBroker"
      ),
      getBrokerRatingSummary(brokerId),
    ]);

    if (listResult.error) {
      console.error("getReviewsForBroker failed:", listResult.error.message);
      return unavailable;
    }

    const rows = (listResult.data ?? []).filter((row) => row && isValidRating(row.rating));
    const names = await getReviewerFirstNames([...new Set(rows.map((row) => row.customer_id))]);
    const reviews: BrokerReview[] = rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      text: row.review_text?.trim() ? row.review_text : null,
      updatedAt: row.updated_at,
      reviewerFirstName: names.get(row.customer_id) ?? FALLBACK_REVIEWER_NAME,
    }));

    // The summary covers every review; if only it failed, fall back to
    // what's in the list (exact whenever there are fewer than the limit).
    if (summary) {
      return { reviews, average: summary.average, count: summary.count, available: true };
    }
    const count = reviews.length;
    const average = count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : null;
    return { reviews, average, count, available: true };
  } catch (err) {
    console.error("getReviewsForBroker threw:", err);
    return unavailable;
  }
}

// The signed-in viewer's relationship to this broker's reviews, plus their
// existing review (if any) to prefill the form.
export async function getMyReview(brokerId: string): Promise<ReviewViewer> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), 5000, "getUser");
    if (!user) return { status: "signed-out" };
    if (user.id === brokerId) return { status: "own-profile" };

    const [customerResult, reviewResult] = await Promise.all([
      withTimeout(
        supabase.from("customers").select("id").eq("id", user.id).maybeSingle<{ id: string }>(),
        5000,
        "getMyReview customer"
      ),
      withTimeout(
        supabase
          .from("broker_reviews")
          .select("rating, review_text, updated_at")
          .eq("broker_id", brokerId)
          .eq("customer_id", user.id)
          .maybeSingle<{ rating: number; review_text: string | null; updated_at: string }>(),
        5000,
        "getMyReview review"
      ),
    ]);

    if (customerResult.error) {
      console.error("getMyReview customer lookup failed:", customerResult.error.message);
      return { status: "unavailable" };
    }
    // Brokers and admins sign in with the same auth but have no customers
    // row — reviews come from customer accounts only.
    if (!customerResult.data) return { status: "not-customer" };

    if (reviewResult.error) {
      console.error("getMyReview failed:", reviewResult.error.message);
      return { status: "unavailable" };
    }
    const row = reviewResult.data;
    return {
      status: "customer",
      review:
        row && isValidRating(row.rating)
          ? { rating: row.rating, text: row.review_text, updatedAt: row.updated_at }
          : null,
    };
  } catch (err) {
    console.error("getMyReview threw:", err);
    return { status: "unavailable" };
  }
}

const GENERIC_SAVE_ERROR = "We couldn't save your review. Please try again.";

function friendlyReviewError(code: string | undefined): string {
  switch (code) {
    // Table/column missing — the migration hasn't been run yet.
    case "42P01":
    case "42703":
    case "PGRST204":
    case "PGRST205":
      return "Reviews aren't available yet. Please try again later.";
    // Foreign key: the broker (or this customer's profile) no longer exists.
    case "23503":
      return "This profile is no longer available to review.";
    // Check constraint: rating range, text length, or a self-review.
    case "23514":
      return `Choose 1 to 5 stars and keep your review to ${REVIEW_TEXT_MAX.toLocaleString("en-US")} characters or fewer.`;
    // RLS rejected the write.
    case "42501":
      return "Reviews are left from customer accounts. Sign in with your customer account to leave one.";
    default:
      return GENERIC_SAVE_ERROR;
  }
}

// Creates or updates the signed-in customer's review of this broker. The
// customer is always taken from the session — never from the request.
// Callers validate/normalize input first (see app/brokers/[id]/actions.ts);
// the checks here are a last line of defence.
export async function upsertReview(
  brokerId: string,
  rating: number,
  text: string | null
): Promise<UpsertReviewResult> {
  if (!isValidRating(rating)) return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  if (text != null && text.length > REVIEW_TEXT_MAX) {
    return { ok: false, error: `Keep your review to ${REVIEW_TEXT_MAX.toLocaleString("en-US")} characters or fewer.` };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), 5000, "getUser");
    if (!user) return { ok: false, error: "Your session has ended. Log in again to leave a review." };
    if (user.id === brokerId) return { ok: false, error: "You can't review your own business." };

    const { data: customer, error: customerError } = await withTimeout(
      supabase.from("customers").select("id").eq("id", user.id).maybeSingle<{ id: string }>(),
      5000,
      "upsertReview customer"
    );
    if (customerError) {
      console.error("upsertReview customer lookup failed:", customerError.message);
      return { ok: false, error: GENERIC_SAVE_ERROR };
    }
    if (!customer) {
      return {
        ok: false,
        error: "Reviews are left from customer accounts. Sign in with your customer account to leave one.",
      };
    }

    const { error } = await withTimeout(
      supabase.from("broker_reviews").upsert(
        {
          broker_id: brokerId,
          customer_id: user.id,
          rating,
          review_text: text || null,
          // The 0015 trigger stamps this (and created_at) authoritatively
          // on the database side too — the API is reachable directly.
          updated_at: new Date().toISOString(),
        },
        { onConflict: "broker_id,customer_id" }
      ),
      10000,
      "upsertReview"
    );
    if (error) {
      console.error("upsertReview failed:", error.code, error.message);
      return { ok: false, error: friendlyReviewError(error.code) };
    }
    return { ok: true };
  } catch (err) {
    console.error("upsertReview threw:", err);
    return { ok: false, error: GENERIC_SAVE_ERROR };
  }
}
