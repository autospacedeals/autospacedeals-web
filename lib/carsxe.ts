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
import sharp from "sharp";
import { downloadImage, getLibraryPhoto, saveCutout, saveFallbackImage, saveImageToLibrary } from "@/lib/photo-library";
import { inspectCarPhoto } from "@/lib/photo-view";

interface PhotoQuery {
  year: number;
  make: string;
  model: string;
  trim?: string;
  // The listing's exterior color as the broker wrote it ("Chalk", "Onyx
  // Black"), or null/undefined/"" when not given.
  color?: string | null;
  // "SUV", "Sedan", "Truck"... when known, so a manufacturer render can be
  // found without guessing.
  bodyStyle?: string | null;
}

// Dealer.com serves manufacturer renders — white background, front
// three-quarter view with the nose to the left — at a predictable address
// per year/make/model/body. Free to check, so it's tried before a metered
// CarsXE lookup; covers new models Chrome Data doesn't have yet.
const RENDER_BODIES: Record<string, string> = { SUV: "SUV", Sedan: "Sedan", Truck: "Truck", Hatchback: "Hatchback", Minivan: "Van", Coupe: "Coupe", Convertible: "Convertible", Wagon: "Wagon" };
// Variants usually shown with the regular model's render.
const VARIANT_SUFFIX = /\s+(plug-in hybrid|plug-in|phev|hybrid|n line)$/i;

function renderUrl(year: number, make: string, model: string, body: string): string {
  const seg = (s: string) => encodeURIComponent(s);
  return `https://images.dealer.com/ddc/vehicles/${year}/${seg(make)}/${seg(model)}/${body}/still/front-left/front-left-640-en_US.jpg`;
}

// The same render, cut out of its backdrop with its soft floor shadow, where
// Dealer.com has one (free; about one model in five).
function perspectiveUrl(year: number, make: string, model: string, body: string): string {
  const seg = (s: string) => encodeURIComponent(s);
  return `https://images.dealer.com/ddc/vehicles/${year}/${seg(make)}/${seg(model)}/${body}/perspective/front-left/${year}_76.png`;
}

async function findRender(params: PhotoQuery, url = renderUrl): Promise<string | null> {
  const models = [params.model];
  for (let m = params.model; VARIANT_SUFFIX.test(m); ) {
    m = m.replace(VARIANT_SUFFIX, "");
    models.push(m);
  }
  const preferred = params.bodyStyle ? RENDER_BODIES[params.bodyStyle] : undefined;
  const bodies = [...new Set([preferred, "SUV", "Sedan", "Truck", "Hatchback", "Van", "Coupe"].filter((b): b is string => Boolean(b)))];
  // This model year first; last year's (usually the same body) only if this year has none.
  for (const year of [params.year, params.year - 1]) {
    for (const model of models) {
      for (const body of bodies) {
        const candidate = url(year, params.make, model, body);
        try {
          const res = await fetch(candidate, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
          if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) return candidate;
        } catch {
          // try the next one
        }
      }
    }
  }
  return null;
}

// Chrome Data stock renders: served from their own CDN, J.D. Power's copy of
// their gallery, or the copies on cars.com's image hosts. Dealer uploads on
// those same hosts have a VIN-style path instead of a stock-photo one.
export function isStudioPhoto(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === "media.chromedata.com") return true;
    if (u.hostname === "cdn.jdpower.com") return u.pathname.startsWith("/ChromeImageGallery/");
    if (u.hostname === "platform.cstatic-images.com") return u.pathname.includes("/stock_photos/");
    // Dealer.com's manufacturer renders (not a dealer's own lot photos).
    if (u.hostname === "images.dealer.com") return u.pathname.startsWith("/ddc/vehicles/");
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

  // Every studio candidate is checked for its angle and that it's the right
  // car; the first front three-quarter with the nose to the left wins.
  // Otherwise a right-facing one (mirrored), then any studio shot, then a
  // checked non-studio photo, then none (better than the wrong car).
  type Pick = { image: Buffer; flop: boolean; color: string | null };
  let mirrored: Pick | null = null;
  let anyStudio: Pick | null = null;
  const fallbacks: string[] = [];
  const seen = new Set<string>();
  const keep = async (p: Pick): Promise<string | null> => {
    const url = await saveImageToLibrary({ ...params, color: p.color }, p.image, { flop: p.flop });
    // No studio shot in the car's color: remember the any-color one for
    // that color too, so it isn't searched for (and paid for) again.
    if (color && p.color === null) await saveImageToLibrary({ ...params, color }, p.image, { flop: p.flop });
    // And the pre-cut version with its floor shadow, which the site shows.
    if (url) await attachShadowedCutout(params, p.color, url);
    return url;
  };

  // A manufacturer render, when there is one and it's the right car.
  const render = await findRender(params);
  if (render) {
    const image = await downloadImage(render);
    if (image) {
      const { matches } = await inspectCarPhoto(image, params);
      if (matches !== false) {
        const url = await keep({ image, flop: false, color: null });
        if (url) return url;
      }
    }
  }

  // This model year first; the year before (usually the same body) only if
  // this one has no front-left studio shot.
  const tries = [
    ...attempts(params, color).map((a) => ({ ...a, year: params.year })),
    ...(color ? [color, null] : [null]).map((c) => ({ color: c, trim: undefined, year: params.year - 1 })),
  ];
  for (const a of tries) {
    const urls = await queryCarsxe({ ...params, year: a.year, trim: a.trim }, a.color);
    for (const u of urls) if (!isStudioPhoto(u) && !fallbacks.includes(u)) fallbacks.push(u);
    for (const url of urls.filter((u) => isStudioPhoto(u) && !seen.has(u))) {
      seen.add(url);
      const image = await downloadImage(url);
      if (!image) continue;
      const { view, matches } = await inspectCarPhoto(image, { ...params, year: a.year });
      if (matches === false) continue;
      const pick = { image, flop: false, color: a.color };
      if (view === "front-left" || view === "unknown") return (await keep(pick)) ?? url;
      if (view === "front-right") mirrored ??= { ...pick, flop: true };
      else anyStudio ??= pick;
    }
  }
  const best = mirrored ?? anyStudio;
  if (best) return keep(best);
  // No studio photo anywhere: a non-studio photo that's checked to be the
  // right car, from the outside, preferring a plain background over a
  // dealership or lot behind it. It's copied to our storage (so it can't
  // break if the other site moves it), but not as the library photo, so a
  // later lookup can still find a studio one.
  type Backup = { url: string; image: Buffer; flop: boolean };
  let cleanBackup: Backup | null = null;
  let sceneBackup: Backup | null = null;
  for (const url of fallbacks.slice(0, MAX_FALLBACK_CHECKS)) {
    const image = await downloadImage(url);
    if (!image) continue;
    const { view, matches, clean } = await inspectCarPhoto(image, params);
    if (matches !== true || view === "rear" || view === "other") continue;
    const pick = { url, image, flop: view === "front-right" };
    if (clean !== false && (view === "front-left" || view === "unknown")) {
      return saveFallbackImage({ ...params, color }, url, image);
    }
    if (clean !== false) cleanBackup ??= pick;
    else sceneBackup ??= pick;
  }
  const backup = cleanBackup ?? sceneBackup;
  return backup ? saveFallbackImage({ ...params, color }, backup.url, backup.image, { flop: backup.flop }) : null;
}

// A new library photo's pre-cut twin: the car on a transparent background
// with its soft floor shadow, as the photo sources make them (much cleaner
// than cutting it out ourselves). Dealer.com's version first (free); if
// there isn't one, one CarsXE lookup for a transparent studio shot (about
// one credit per new car), checked for the right car and angle like the
// main photo. Best-effort: without one the site cuts the photo itself.
async function attachShadowedCutout(params: PhotoQuery, color: string | null, photoUrl: string): Promise<void> {
  try {
    const free = await findRender(params, perspectiveUrl);
    const freeImage = free ? await downloadImage(free) : null;
    if (freeImage && (await saveCutout(photoUrl, freeImage))) return;

    let mirrored: Buffer | null = null;
    const urls = await queryCarsxe(params, color, { transparent: true });
    for (const url of urls.slice(0, MAX_CUTOUT_CHECKS)) {
      const image = await downloadImage(url);
      if (!image || !(await hasClearBackground(image))) continue;
      const { view, matches } = await inspectCarPhoto(await sharp(image).flatten({ background: "#ffffff" }).png().toBuffer(), params);
      if (matches === false) continue;
      if (view === "front-left" || view === "unknown") {
        await saveCutout(photoUrl, image);
        return;
      }
      if (view === "front-right") mirrored ??= image;
    }
    if (mirrored) await saveCutout(photoUrl, mirrored, { flop: true });
  } catch (err) {
    console.error("attachShadowedCutout failed:", err instanceof Error ? err.message : err);
  }
}

const MAX_CUTOUT_CHECKS = 6;

// Whether an image really has a see-through background (a fair share of
// clear pixels), not just an alpha channel.
async function hasClearBackground(image: Buffer): Promise<boolean> {
  const meta = await sharp(image).metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await sharp(image).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 0; i < data.length; i++) if (data[i] < 8) clear++;
  return clear / (info.width * info.height) > 0.15;
}

// Non-studio photos checked per car before giving up (each is a small AI call).
const MAX_FALLBACK_CHECKS = 12;

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

async function queryCarsxe(params: PhotoQuery, color: string | null, opts: { transparent?: boolean } = {}): Promise<string[]> {
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
  // Pre-cut studio shots on a transparent background, with their shadow.
  if (opts.transparent) {
    query.set("transparent", "true");
    query.delete("photoType");
  }

  // A big upload fires many lookups at once and CarsXE starts refusing
  // some (rate limits); those are retried with a growing pause instead of
  // being taken as "no photo for this car".
  const label = `${params.year} ${params.make} ${params.model}`;
  for (let attempt = 0; attempt < LOOKUP_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1) + Math.random() * 500);
    try {
      const res = await fetch(`https://api.carsxe.com/images?${query.toString()}`, {
        // Photo lookups don't need to be re-fetched on every request — cache
        // briefly so we're not hammering CarsXE if several listings publish
        // back to back.
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return extractImageUrls(await res.json());
      if (res.status !== 429 && res.status < 500) {
        console.error(`CarsXE photo lookup refused (${res.status}) for ${label}`);
        return [];
      }
      console.error(`CarsXE photo lookup busy (${res.status}) for ${label}, attempt ${attempt + 1}`);
    } catch (err) {
      console.error(`CarsXE photo lookup failed for ${label}, attempt ${attempt + 1}:`, err instanceof Error ? err.message : err);
    }
  }
  return [];
}

const LOOKUP_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
