// Read-only star display for broker ratings, plus the compact
// "★ 4.8 · 12 reviews" link badge — shared by the broker profile
// (app/brokers/[id]/page.tsx) and the deal page's contact card
// (components/DealDetailView.tsx). No hooks, so it renders in both Server
// and Client Components. The interactive picker lives in the review form.
import Link from "next/link";
import { Star } from "lucide-react";
import { formatAverageRating, reviewCountLabel } from "@/lib/reviews";

export default function StarRating({
  value,
  size = 16,
  decorative = false,
  className = "",
}: {
  value: number;
  size?: number;
  // True when the same rating is already written out as text next to the
  // stars, so screen readers don't hear it twice.
  decorative?: boolean;
  className?: string;
}) {
  const rating = Math.round(Math.max(0, Math.min(5, value)) * 10) / 10;
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : {
        role: "img",
        "aria-label": `${Number.isInteger(rating) ? rating : rating.toFixed(1)} out of 5 stars`,
      };

  return (
    <span {...a11y} className={`inline-flex items-center gap-0.5 ${className}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        // 0–1 fill for this star, so an average like 4.3 shows a partial star.
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} aria-hidden="true" className="relative inline-flex shrink-0">
            <Star size={size} className="text-fg-faint" />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.round(fill * 100)}%` }}>
                <Star size={size} className="max-w-none fill-current text-accent-fg" />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// Small average-rating link, e.g. near a broker's name or in a deal's
// contact card, jumping to the profile's reviews. Callers only render it
// when there's at least one review.
export function RatingBadge({
  average,
  count,
  href,
  className = "",
}: {
  average: number;
  count: number;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group inline-flex min-h-9 items-center gap-1.5 text-sm text-fg-muted pointer-coarse:min-h-11 ${className}`}
    >
      <Star size={15} aria-hidden="true" className="shrink-0 fill-current text-accent-fg" />
      <span className="font-medium text-fg">{formatAverageRating(average)}</span>
      <span className="sr-only"> out of 5 stars from</span>
      <span aria-hidden="true">·</span>
      <span className="transition-colors group-hover:text-fg">{reviewCountLabel(count)}</span>
    </Link>
  );
}
