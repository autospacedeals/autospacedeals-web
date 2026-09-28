"use client";

import { startTransition, useActionState, useId, useState, type FormEvent } from "react";
import { Star, Send, CircleCheck, CircleAlert } from "lucide-react";
import { submitReviewAction, type ReviewFormState } from "./actions";
import { REVIEW_TEXT_MAX } from "@/lib/reviews";

const initialState: ReviewFormState = { status: "idle", message: null };

export default function ReviewForm({
  brokerId,
  businessName,
  sellerType,
  initialRating,
  initialText,
}: {
  brokerId: string;
  businessName: string;
  sellerType: string;
  initialRating: number | null;
  initialText: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitReviewAction, initialState);
  const [rating, setRating] = useState(initialRating ?? 0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [text, setText] = useState(initialText ?? "");
  const textId = useId();
  const hintId = useId();
  const hasReview = initialRating != null || state.status === "success";
  const shownRating = hovered ?? rating;

  // Submit through the action by hand instead of letting <form action>
  // do it: React resets a form after every action — including one that
  // returns an error — which would wipe the customer's text on a failed
  // save. (Without JS the form still posts to the same action natively.)
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h3 className="type-title">{hasReview ? "Update your review" : `Rate this ${sellerType.toLowerCase()}`}</h3>
        <p className="mt-1 text-sm text-fg-muted">
          {hasReview
            ? `Changed your mind about ${businessName}? Edit your rating or review any time.`
            : `Worked with ${businessName}? Let other shoppers know how it went.`}
        </p>
      </div>

      <input type="hidden" name="brokerId" value={brokerId} />

      <fieldset>
        <legend className="field-label">Your rating</legend>
        {/* A native radio group: Tab moves into it, arrow keys change the
            rating. Each star is a 44px label around a visually hidden radio. */}
        <div className="-ml-2 flex" onMouseLeave={() => setHovered(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              onMouseEnter={() => setHovered(n)}
              className="grid size-11 cursor-pointer place-items-center rounded-full transition-colors hover:bg-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                required
                checked={rating === n}
                onChange={() => setRating(n)}
                className="sr-only"
              />
              <Star
                size={26}
                aria-hidden="true"
                className={`transition-colors ${n <= shownRating ? "fill-current text-accent-fg" : "text-fg-muted"}`}
              />
              <span className="sr-only">{n === 1 ? "1 star" : `${n} stars`}</span>
            </label>
          ))}
        </div>
        <p className="field-hint mt-1">{rating > 0 ? `${rating} out of 5 stars` : "Choose 1 to 5 stars"}</p>
      </fieldset>

      <div>
        <label htmlFor={textId} className="field-label">
          Your review <span className="text-fg-muted">(optional)</span>
        </label>
        <textarea
          id={textId}
          name="text"
          rows={5}
          maxLength={REVIEW_TEXT_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`What was it like working with ${businessName}?`}
          aria-describedby={hintId}
          className="textarea"
        />
        <div id={hintId} className="field-hint flex justify-between gap-3">
          <span>Your first name, rating, and review are shown publicly.</span>
          <span className="shrink-0">
            {text.length.toLocaleString("en-US")} / {REVIEW_TEXT_MAX.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      <div>
        {state.status === "error" && state.message && (
          <p role="alert" className="alert alert-danger mb-4">
            <CircleAlert />
            {state.message}
          </p>
        )}
        {/* Always mounted so screen readers reliably announce the success message. */}
        <div aria-live="polite">
          {state.status === "success" && state.message && (
            <p className="alert alert-success mb-4">
              <CircleCheck />
              {state.message}
            </p>
          )}
        </div>

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          <Send /> {pending ? "Saving..." : hasReview ? "Update review" : "Post review"}
        </button>
      </div>
    </form>
  );
}
