// Drive's own library of stock car photos (Supabase Storage bucket
// "car-photos"): the first good studio photo found for a year/make/model/
// color is copied here, and every later listing of that car reuses it — no
// repeat CarsXE lookup (they're metered), and no broken image if the
// original host moves it. Saved as a 960px-wide WebP so they're uniform.
// SERVER-ONLY.
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";

export const PHOTO_BUCKET = "car-photos";

export interface LibraryKey {
  year: number;
  make: string;
  model: string;
  color?: string | null; // the paint color searched for, or null for "any"
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "x";

// e.g. "bmw/2026/x5/black-sapphire.webp"
export function libraryPath(k: LibraryKey): string {
  return `${slug(k.make)}/${k.year}/${slug(k.model)}/${k.color ? slug(k.color) : "any"}.webp`;
}

function publicUrl(path: string): string {
  return createAdminClient().storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// The saved photo's URL, or null if there isn't one yet.
export async function getLibraryPhoto(k: LibraryKey): Promise<string | null> {
  const url = publicUrl(libraryPath(k));
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    // Versioned by the file's ETag, so a photo replaced in place isn't served
    // stale from a cache.
    const tag = (res.headers.get("etag") ?? "").replace(/\W/g, "").slice(0, 12);
    return tag ? `${url}?v=${tag}` : url;
  } catch {
    return null;
  }
}

// Downloads a photo, or null if it can't be fetched or isn't an image.
export async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DriveBot/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Saves a photo into the library (mirrored first when `flop`, to turn a
// right-facing shot left) and returns its URL there, or null on failure.
export async function saveImageToLibrary(k: LibraryKey, image: Buffer, opts: { flop?: boolean } = {}): Promise<string | null> {
  try {
    let pipeline = sharp(image).resize({ width: 960, withoutEnlargement: true });
    if (opts.flop) pipeline = pipeline.flop();
    const webp = await pipeline.flatten({ background: "#ffffff" }).webp({ quality: 82 }).toBuffer();
    const path = libraryPath(k);
    const { error } = await createAdminClient()
      .storage.from(PHOTO_BUCKET)
      .upload(path, webp, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
    if (error) {
      console.error("saveImageToLibrary upload failed:", error.message);
      return null;
    }
    // Cache-busting version, since a library photo can be replaced in place.
    return `${publicUrl(path)}?v=${Date.now().toString(36)}`;
  } catch (err) {
    console.error("saveImageToLibrary failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Copies a photo from a URL into the library.
export async function saveToLibrary(k: LibraryKey, sourceUrl: string): Promise<string | null> {
  const image = await downloadImage(sourceUrl);
  return image ? saveImageToLibrary(k, image) : null;
}
