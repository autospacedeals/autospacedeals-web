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
      <div className="relative overflow-hidden rounded-3xl bg-zinc-900">
        <img
          src={safeImages[clampedIndex]}
          alt={alt}
          className="aspect-[4/3] w-full object-contain"
        />
        {children}

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-zinc-950/80 text-zinc-300 backdrop-blur transition hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-zinc-950/80 text-zinc-300 backdrop-blur transition hover:bg-white/10 hover:text-white"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {safeImages.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border bg-zinc-900 transition ${
                i === clampedIndex ? "border-white" : "border-white/10 hover:border-white/30"
              }`}
            >
              <img src={img} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
