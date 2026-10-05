// Fallback photo lookup via the CarsXE Vehicle Images API — used when a
// broker publishes a car without uploading their own photo. Best-effort:
// any failure (missing key, no match, network error, unexpected response
// shape) just returns null and the listing falls back to the generic
// placeholder image instead of blocking the publish.
//
// Only studio stock photos are used — Chrome Data's (white background, the
// same front three-quarter angle facing left on every car) — never a
// dealer's lot or showroom shot, so listings look uniform. The car's color
// is searched first, then any color. The first studio photo for a
// year/make/model/color is saved to Drive's photo library
// (lib/photo-library.ts) and reused from then on.
import { downloadImage, getLibraryPhoto, saveImageToLibrary } from "@/lib/photo-library";
import { classifyCarView } from "@/lib/photo-view";

interface PhotoQuery {
  year: number;
  make: string;
  model: string;
  trim?: string;
  // The listing's exterior color as the broker wrote it ("Chalk", "Onyx
  // Black"), or null/undefined/"" when not given.
  color?: string | null;
}

// Chrome Data stock renders: served from their own CDN, or the copies on
// cars.com's image host. Dealer uploads on that same host have a VIN-style
// path instead of /stock-images/chrome/.
export function isStudioPhoto(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === "media.chromedata.com") return true;
    return u.hostname === "vehicle-images.carscommerce.inc" && u.pathname.startsWith("/stock-images/chrome/");
  } catch {
    return false;
  }
}

// The lookups to try, most specific first: the car's color (with trim,
// then without), then any color (same).
function attempts(params: PhotoQuery, color: string | null): { trim?: string; color: string | null }[] {
  const list: { trim?: string; color: string | null }[] = [];
  for (const c of color ? [color, null] : [null]) {
    if (params.trim) list.push({ trim: params.trim, color: c });
    list.push({ color: c });
  }
  return list;
}

export async function fetchCarsxePhoto(params: PhotoQuery): Promise<string | null> {
  const color = searchColor(params.color);
  const saved = await getLibraryPhoto({ ...params, color });
  if (saved) return saved;

  // Every studio candidate is checked for its angle; the first front
  // three-quarter with the nose to the left wins. Otherwise a right-facing
  // one (mirrored), then any studio shot, then any photo at all.
  type Pick = { image: Buffer; flop: boolean; color: string | null };
  let mirrored: Pick | null = null;
  let anyStudio: Pick | null = null;
  let fallback: string | null = null;
  const seen = new Set<string>();
  const keep = async (p: Pick): Promise<string | null> => {
    const url = await saveImageToLibrary({ ...params, color: p.color }, p.image, { flop: p.flop });
    // No studio shot in the car's color: remember the any-color one for
    // that color too, so it isn't searched for (and paid for) again.
    if (color && p.color === null) await saveImageToLibrary({ ...params, color }, p.image, { flop: p.flop });
    return url;
  };

  // This model year first; the year before (usually the same body) only if
  // this one has no front-left studio shot.
  const tries = [
    ...attempts(params, color).map((a) => ({ ...a, year: params.year })),
    ...(color ? [color, null] : [null]).map((c) => ({ color: c, trim: undefined, year: params.year - 1 })),
  ];
  for (const a of tries) {
    const urls = await queryCarsxe({ ...params, year: a.year, trim: a.trim }, a.color);
    fallback ??= urls[0] ?? null;
    for (const url of urls.filter((u) => isStudioPhoto(u) && !seen.has(u))) {
      seen.add(url);
      const image = await downloadImage(url);
      if (!image) continue;
      const view = await classifyCarView(image);
      const pick = { image, flop: false, color: a.color };
      if (view === "front-left" || view === "unknown") return (await keep(pick)) ?? url;
      if (view === "front-right") mirrored ??= { ...pick, flop: true };
      else anyStudio ??= pick;
    }
  }
  const best = mirrored ?? anyStudio;
  if (best) return keep(best);
  // No studio photo anywhere: better a real photo than none (not saved, so
  // a later lookup can still find a studio one).
  return fallback;
}

// Every exterior photo CarsXE has for the vehicle, studio photos first (the
// listing's color, then any color) — the "Re-pull photo" button steps
// through these instead of always getting back the first one (which the
// listing usually already has).
export async function fetchCarsxePhotos(params: PhotoQuery): Promise<string[]> {
  const color = searchColor(params.color);
  const [inColor, any] = await Promise.all([
    color ? queryCarsxe(params, color) : Promise.resolve([]),
    queryCarsxe(params, null),
  ]);
  const all = [...new Set([...inColor, ...any])];
  return [...all.filter(isStudioPhoto), ...all.filter((u) => !isStudioPhoto(u))];
}

// "Black x Black" style values sometimes land in the exterior field; only
// the exterior half is the car's paint. Junk like "TBD" / "N/A" means no color.
export function searchColor(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (/^(tbd|n\/?a|any|various|multiple|assorted|-+)$/i.test(value)) return null;
  return value.split(/\s+x\s+|\/|,/i)[0].trim().slice(0, 40) || null;
}

async function queryCarsxe(params: PhotoQuery, color: string | null): Promise<string[]> {
  const apiKey = process.env.CARSXE_API_KEY;
  if (!apiKey) return [];

  const query = new URLSearchParams({
    key: apiKey,
    make: params.make,
    model: params.model,
    year: String(params.year),
    license: "ShareCommercially",
  });
  if (color) {
    // CarsXE ignores `color` when photoType is set, so a color search goes
    // without it — searching for the car in a color comes back as exterior
    // shots anyway.
    query.set("color", color);
  } else {
    // Without this, CarsXE's result set is a grab-bag that can include
    // interior and engine-bay close-ups — which is why some auto-sourced
    // photos didn't actually show the whole car. Restricting to exterior
    // shots is the fix; there's no per-image angle/type field in the
    // response to filter on afterward, only this request-side filter.
    query.set("photoType", "exterior");
  }
  if (params.trim) query.set("trim", params.trim);

  try {
    const res = await fetch(`https://api.carsxe.com/images?${query.toString()}`, {
      // Photo lookups don't need to be re-fetched on every request — cache
      // briefly so we're not hammering CarsXE if several listings publish
      // back to back.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    return extractImageUrls(data);
  } catch (err) {
    console.error("CarsXE photo lookup failed:", err);
    return [];
  }
}

// CarsXE's response shape has varied across versions of this API in
// practice, so this checks the common shapes rather than assuming one.
function extractImageUrls(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;

  const candidates: unknown[] = [];
  if (Array.isArray(obj.images)) candidates.push(...obj.images);
  if (Array.isArray(obj.result)) candidates.push(...obj.result);
  if (Array.isArray(data)) candidates.push(...(data as unknown[]));

  const urls: string[] = [];
  for (const item of candidates) {
    let url: unknown = item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      url = rec.link ?? rec.url ?? rec.src;
    }
    if (typeof url === "string" && url.startsWith("http") && !urls.includes(url)) urls.push(url);
  }
  return urls;
}
