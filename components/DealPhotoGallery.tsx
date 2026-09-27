"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// The deal data model has always supported multiple photos (brokers can
// already paste several URLs, one per line, in the listing editor) — this
// is just the missing viewer for them. Badges/labels (condition, "stock
// photo", etc.) are passed in as children so they stay overlaid on the main
// image no matter which photo is selected.
export default function DealPhotoGallery({
  images,
  alt,
  children,
}: {
  images: string[];
  alt: string;
  children?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const safeImages = images.length > 0 ? images : [""];
  const hasMultiple = safeImages.length > 1;
  const clampedIndex = Math.min(index, safeImages.length - 1);

  function prev() {
    setIndex((i) => (i - 1 + safeImages.length) % safeImages.length);
  }
  function next() {
    setIndex((i) => (i + 1) % safeImages.length);
  }

  return (
    <div>
      <div className="media-stage aspect-[4/3] rounded-3xl border border-line">
        <img src={safeImages[clampedIndex]} alt={alt} className="media-img" />
        {children}

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous photo"
              className="btn btn-secondary btn-icon absolute top-1/2 left-3 -translate-y-1/2 bg-canvas/70 backdrop-blur"
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="btn btn-secondary btn-icon absolute top-1/2 right-3 -translate-y-1/2 bg-canvas/70 backdrop-blur"
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        // p-1 (offset by -mx-1 / mt-2) leaves room for the focus outline and
        // the active ring, which the scroll container would otherwise clip.
        // A focused thumbnail goes to full opacity so its ring isn't dimmed.
        <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto p-1">
          {safeImages.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === clampedIndex ? "true" : undefined}
              className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-raised opacity-60 transition hover:border-line-strong hover:opacity-100 focus-visible:opacity-100 aria-[current=true]:border-accent aria-[current=true]:opacity-100 aria-[current=true]:ring-2 aria-[current=true]:ring-accent/30"
            >
              <img src={img} alt="" className="size-full object-cover object-[50%_58%]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
