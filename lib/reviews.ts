// Client-safe helpers for broker ratings & reviews — constants and
// formatting shared by the review form (a Client Component), the broker
// profile page, and the deal page's rating badge. The Supabase reads and
// writes live in lib/supabase/reviews.ts, which is server-only (it uses the
// cookie session and the service role), so nothing here may import it.

// Matches the char_length check on broker_reviews.review_text (0015).
export const REVIEW_TEXT_MAX = 2000;

// How many of the newest reviews the broker profile lists. The average and
// count shown alongside always cover every review, not just these.
export const REVIEWS_LIST_LIMIT = 50;

export function formatAverageRating(average: number): string {
  return (Math.round(average * 10) / 10).toFixed(1);
}

export function reviewCountLabel(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "review" : "reviews"}`;
}

// Browsers submit textarea line breaks as CRLF, which would count double
// against the length limit — normalize them, drop control characters
// (Postgres text can't even store NUL), and trim the ends.
export function normalizeReviewText(raw: string): string {
  let out = "";
  for (const ch of raw.replace(/\r\n?/g, "\n")) {
    const code = ch.charCodeAt(0);
    const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (!isControl || ch === "\n" || ch === "\t") out += ch;
  }
  return out.trim();
}

// "Today", "3 days ago", "2 months ago"… for a review's last-updated time.
// Rendered on the server per request (the broker page is dynamic), so
// there's no hydration mismatch to worry about.
export function reviewDateLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return months === 1 ? "1 month ago" : `${months} months ago`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

// Full date for the <time> tooltip, in California time (where the
// marketplace is) rather than the server's UTC.
export function reviewFullDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}
