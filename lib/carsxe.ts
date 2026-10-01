// Fallback photo lookup via the CarsXE Vehicle Images API — used when a
// broker publishes a car without uploading their own photo. Best-effort:
// any failure (missing key, no match, network error, unexpected response
// shape) just returns null and the listing falls back to the generic
// placeholder image instead of blocking the publish.
export async function fetchCarsxePhoto(params: {
  year: number;
  make: string;
  model: string;
  trim?: string;
}): Promise<string | null> {
  return (await fetchCarsxePhotos(params))[0] ?? null;
}

// Every exterior photo CarsXE has for the vehicle, best match first — the
// "Re-pull photo" button steps through these instead of always getting
// back the first one (which the listing usually already has).
export async function fetchCarsxePhotos(params: {
  year: number;
  make: string;
  model: string;
  trim?: string;
}): Promise<string[]> {
  const apiKey = process.env.CARSXE_API_KEY;
  if (!apiKey) return [];

  const query = new URLSearchParams({
    key: apiKey,
    make: params.make,
    model: params.model,
    year: String(params.year),
    license: "ShareCommercially",
    // Without this, CarsXE's result set is a grab-bag that can include
    // interior and engine-bay close-ups — which is why some auto-sourced
    // photos didn't actually show the whole car. Restricting to exterior
    // shots is the fix; there's no per-image angle/type field in the
    // response to filter on afterward, only this request-side filter.
    photoType: "exterior",
  });
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
