// Which listing photos get the cut-out treatment (lib/photo-cutout.ts,
// served by /api/photo): only photos in Drive's own storage. Safe for the
// browser bundle (no image library here).
const PHOTO_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/car-photos/`;

export function isCutoutSource(src: string): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && src.startsWith(PHOTO_PREFIX) && !src.includes("..");
}

// Bump when the cutouts change (lib/photo-cutout.ts, or a new batch of the
// ready-made ones in storage): they're cached for a year, so
// a new version needs a new address to reach browsers that saw the old one.
const CUTOUT_VERSION = 13;

// The cut-out version of a listing photo; any other URL is left as it is.
export function cutoutSrc(src: string | null | undefined): string {
  if (!src) return "";
  return isCutoutSource(src) ? `/api/photo?v=${CUTOUT_VERSION}&src=${encodeURIComponent(src)}` : src;
}
