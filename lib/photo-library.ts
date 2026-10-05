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
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

// Copies a photo into the library and returns its URL there, or null if it
// couldn't be fetched/saved (the caller can still use the original).
export async function saveToLibrary(k: LibraryKey, sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DriveBot/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(input)
      .resize({ width: 960, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 82 })
      .toBuffer();
    const path = libraryPath(k);
    const { error } = await createAdminClient()
      .storage.from(PHOTO_BUCKET)
      .upload(path, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
    if (error) {
      console.error("saveToLibrary upload failed:", error.message);
      return null;
    }
    return publicUrl(path);
  } catch (err) {
    console.error("saveToLibrary failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
