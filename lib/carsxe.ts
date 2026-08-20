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
  const apiKey = process.env.CARSXE_API_KEY;
  if (!apiKey) return null;

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
    if (!res.ok) return null;

    const data = await res.json();
    return extractFirstImageUrl(data);
  } catch (err) {
    console.error("CarsXE photo lookup failed:", err);
    return null;
  }
}

// CarsXE's response shape has varied across versions of this API in
// practice, so this checks the common shapes rather than assuming one.
function extractFirstImageUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const candidates: unknown[] = [];
  if (Array.isArray(obj.images)) candidates.push(...obj.images);
  if (Array.isArray(obj.result)) candidates.push(...obj.result);
  if (Array.isArray(data)) candidates.push(...(data as unknown[]));

  for (const item of candidates) {
    if (typeof item === "string" && item.startsWith("http")) return item;
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      const url = rec.link ?? rec.url ?? rec.src;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

  return null;
}
