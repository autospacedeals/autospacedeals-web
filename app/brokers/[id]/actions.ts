"use server";

import { revalidatePath } from "next/cache";
import { upsertReview } from "@/lib/supabase/reviews";
import { REVIEW_TEXT_MAX, normalizeReviewText } from "@/lib/reviews";

export type ReviewFormState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): ReviewFormState {
  return { status: "error", message };
}

// Posts (or updates) the signed-in customer's review of a broker. The
// broker id comes from the form, but it's only the review's *target* —
// who's writing it always comes from the session inside upsertReview(), and
// RLS enforces the same thing in the database.
export async function submitReviewAction(
  _prevState: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const brokerId = formData.get("brokerId");
  const ratingRaw = formData.get("rating");
  const textRaw = formData.get("text") ?? "";

  if (typeof brokerId !== "string" || !UUID_RE.test(brokerId)) {
    return fail("This profile couldn't be found. Refresh the page and try again.");
  }
  if (typeof ratingRaw !== "string" || !/^[1-5]$/.test(ratingRaw)) {
    return fail("Choose a rating from 1 to 5 stars.");
  }
  if (typeof textRaw !== "string") {
    return fail("Your review couldn't be read. Please try again.");
  }
  const text = normalizeReviewText(textRaw);
  if (text.length > REVIEW_TEXT_MAX) {
    return fail(`Keep your review to ${REVIEW_TEXT_MAX.toLocaleString("en-US")} characters or fewer.`);
  }

  const result = await upsertReview(brokerId, Number(ratingRaw), text || null);
  if (!result.ok) return fail(result.error);

  revalidatePath(`/brokers/${brokerId}`);
  return { status: "success", message: "Thanks — your review is saved." };
}
