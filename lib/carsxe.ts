// Fallback photo lookup via the CarsXE Vehicle Images API — used when a
// broker publishes a car without uploading their own photo. Best-effort:
// any failure (missing key, no match, network error, unexpected response
// shape) just returns null and the listing falls back to the generic
// placeholder image instead of blocking the publish.
//
// When the listing has an exterior color, photos of the car in that color
// come first, falling back to any color when CarsXE has none.
interface PhotoQuery {
  year: number;
  make: string;
  model: string;
  trim?: string;
  // The listing's exterior color as the broker wrote it ("Chalk", "Onyx
  // Black"), or null/undefined/"" when not given.
  color?: string | null;
}

export async function fetchCarsxePhoto(params: PhotoQuery): Promise<string | null> {
  const color = searchColor(params.color);
  if (color) {
    const inColor = await queryCarsxe(params, color);
    if (inColor[0]) return inColor[0];
  }
  return (await queryCarsxe(params, null))[0] ?? null;
}

// Every exterior photo CarsXE has for the vehicle, best match first (the
// listing's color, then any color) — the "Re-pull photo" button steps
// through these instead of always getting back the first one (which the
// listing usually already has).
export async function fetchCarsxePhotos(params: PhotoQuery): Promise<string[]> {
  const color = searchColor(params.color);
  const [inColor, any] = await Promise.all([
    color ? queryCarsxe(params, color) : Promise.resolve([]),
    queryCarsxe(params, null),
  ]);
  return [...new Set([...inColor, ...any])];
}

// "Black x Black" style values sometimes land in the exterior field; only
// the exterior half is the car's paint. Junk like "TBD" / "N/A" means no color.
function searchColor(raw: string | null | undefined): string | null {
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
