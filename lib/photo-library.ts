// Drive's own library of stock car photos (Supabase Storage bucket
// "car-photos"): the first good studio photo found for a year/make/model/
// color is copied here, and every later listing of that car reuses it — no
// repeat CarsXE lookup (they're metered), and no broken image if the
// original host moves it. Saved as a 960px-wide WebP so they're uniform.
// SERVER-ONLY.
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchPublicImage } from "@/lib/website-inventory";

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

// The car cut out of its backdrop, with its soft floor shadow, for a
// library photo: what /api/photo serves in its place
// (cutouts/<sha1 of the photo's URL>.webp). Framed like the library
// photos: trimmed to the car and its shadow, then the car at about 92% of a
// 4:3 canvas's width. Mirrored first when `flop`. Returns whether it saved.
export async function saveCutout(photoUrl: string, transparent: Buffer, opts: { flop?: boolean } = {}): Promise<boolean> {
  try {
    let source = sharp(transparent).ensureAlpha();
    if (opts.flop) source = source.flop();
    const trimmed = await source.trim({ threshold: 2 }).toBuffer({ resolveWithObject: true });
    const { width: cw, height: ch } = trimmed.info;
    const W = Math.min(1600, Math.round(cw / 0.92));
    const carW = Math.round(W * 0.92);
    const carH = Math.round((ch * carW) / cw);
    const H = Math.max(Math.round(W * 0.75), carH + 20);
    const car = await sharp(trimmed.data).resize(carW, carH).toBuffer();
    const webp = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: car, left: Math.round((W - carW) / 2), top: Math.round((H - carH) / 2) }])
      .webp({ quality: 88, alphaQuality: 95 })
      .toBuffer();
    const key = createHash("sha1").update(photoUrl).digest("hex");
    const { error } = await createAdminClient()
      .storage.from(PHOTO_BUCKET)
      .upload(`cutouts/${key}.webp`, webp, { contentType: "image/webp", upsert: true, cacheControl: "31536000" });
    if (error) {
      console.error("saveCutout upload failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("saveCutout failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

// A fallback photo (not a studio shot) copied into our storage under its
// own path, never as the library photo for the car, so it can't break if
// the original site removes it. Returns its URL here, or null on failure.
export async function saveFallbackPhoto(k: LibraryKey, sourceUrl: string): Promise<string | null> {
  const image = await downloadImage(sourceUrl);
  return image ? saveFallbackImage(k, sourceUrl, image) : null;
}

export async function saveFallbackImage(
  k: LibraryKey,
  sourceUrl: string,
  image: Buffer,
  opts: { flop?: boolean } = {}
): Promise<string | null> {
  try {
    let pipeline = sharp(image).resize({ width: 960, withoutEnlargement: true });
    if (opts.flop) pipeline = pipeline.flop();
    const webp = await pipeline.flatten({ background: "#ffffff" }).webp({ quality: 82 }).toBuffer();
    const id = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16);
    const path = `fallback/${slug(k.make)}/${k.year}/${slug(k.model)}/${id}.webp`;
    const { error } = await createAdminClient()
      .storage.from(PHOTO_BUCKET)
      .upload(path, webp, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
    if (error) {
      console.error("saveFallbackPhoto upload failed:", error.message);
      return null;
    }
    return publicUrl(path);
  } catch (err) {
    console.error("saveFallbackPhoto failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Copies a photo from a URL into the library.
export async function saveToLibrary(k: LibraryKey, sourceUrl: string): Promise<string | null> {
  const image = await downloadImage(sourceUrl);
  return image ? saveImageToLibrary(k, image) : null;
}

// One of a seller's own photos (from their website, which they linked and so
// gave us to use), copied into our storage so it can't break if their site
// changes. The same photo is stored once per seller. Returns its URL here,
// or null on failure.
export async function saveSellerPhoto(brokerId: string, sourceUrl: string): Promise<string | null> {
  const image = await fetchPublicImage(sourceUrl);
  if (!image) return null;
  try {
    const webp = await (await frameSellerPhoto(image)).webp({ quality: 82 }).toBuffer();
    const id = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 20);
    const path = `sellers/${brokerId}/${id}.webp`;
    const { error } = await createAdminClient()
      .storage.from(PHOTO_BUCKET)
      .upload(path, webp, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
    if (error) {
      console.error("saveSellerPhoto upload failed:", error.message);
      return null;
    }
    return publicUrl(path);
  } catch (err) {
    console.error("saveSellerPhoto failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Seller photos framed like our stock photos, so their cars don't look small
// next to them: many sellers' studio shots are squares with the car small in
// the middle of a plain background, and cards show photos whole in a 4:3
// frame. A car on a plain background is trimmed and re-centered on a 4:3
// canvas of that background with stock-photo margins; a full photo padded
// with a plain border (an interior shot) just loses the border; anything
// else is left as it is. Returns the pipeline, not yet encoded.
const FRAME_W = 1280;
const FRAME_H = 960;
const CAR_MAX_W = 0.9; // of the frame: about how much of a stock photo the car fills
const CAR_MAX_H = 0.72;

export async function frameSellerPhoto(image: Buffer): Promise<sharp.Sharp> {
  const plain = () =>
    sharp(image).rotate().resize({ width: FRAME_W, withoutEnlargement: true }).flatten({ background: "#ffffff" });
  try {
    const upright = await sharp(image).rotate().flatten({ background: "#ffffff" }).toBuffer();
    const { data, info } = await sharp(upright).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const near = (a: number[], b: number[], tol = 14) => a.every((v, k) => Math.abs(v - b[k]) <= tol);
    // The background: all four corners the same light color.
    const bg = px(0, 0);
    const corners = [px(info.width - 1, 0), px(0, info.height - 1), px(info.width - 1, info.height - 1)];
    if (Math.min(...bg) < 200 || !corners.every((c) => near(c, bg))) return plain();

    const trimmed = await sharp(upright)
      .trim({ background: { r: bg[0], g: bg[1], b: bg[2] }, threshold: 12 })
      .toBuffer({ resolveWithObject: true });
    const box = trimmed.info;
    if (box.width < info.width * 0.2 || box.height < info.height * 0.1) return plain();

    // A padded photo fills its box to the corners; a car on a plain
    // background leaves them empty.
    const inner = await sharp(trimmed.data).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * inner.info.width + x) * inner.info.channels;
      return [inner.data[i], inner.data[i + 1], inner.data[i + 2]];
    };
    const inset = 4;
    const boxCorners = [
      at(inset, inset),
      at(inner.info.width - 1 - inset, inset),
      at(inset, inner.info.height - 1 - inset),
      at(inner.info.width - 1 - inset, inner.info.height - 1 - inset),
    ];
    const emptyCorners = boxCorners.filter((c) => near(c, bg, 24)).length;
    if (emptyCorners < 3) {
      return sharp(trimmed.data).resize({ width: FRAME_W, withoutEnlargement: true });
    }

    const scale = Math.min((FRAME_W * CAR_MAX_W) / box.width, (FRAME_H * CAR_MAX_H) / box.height);
    const w = Math.round(box.width * scale);
    const h = Math.round(box.height * scale);
    // Edges faded into the new background, so there's no seam where the
    // photo's own background was slightly off from the corner color.
    const feather = Math.max(2, Math.round(Math.min(w, h) * 0.02));
    const mask = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="black"/>` +
          `<rect x="${feather}" y="${feather}" width="${w - 2 * feather}" height="${h - 2 * feather}" fill="white"/></svg>`
      )
    )
      .blur(feather / 2)
      .extractChannel(0)
      .toBuffer();
    const car = await sharp(trimmed.data).resize(w, h).removeAlpha().joinChannel(mask).png().toBuffer();
    const background = { r: bg[0], g: bg[1], b: bg[2] };
    return sharp({ create: { width: FRAME_W, height: FRAME_H, channels: 3, background } }).composite([
      { input: car, left: Math.round((FRAME_W - w) / 2), top: Math.round((FRAME_H - h) / 2) },
    ]);
  } catch {
    return plain();
  }
}

