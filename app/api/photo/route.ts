// A listing photo with its white studio backdrop made transparent, so the
// car sits straight on the page in either theme. The clean version made
// ahead of time (cutouts/<sha1 of the photo URL>.webp in the car-photos
// bucket — the URL with its ?v= version, or without it: the same library
// photo is linked with different version tags over time) is served when
// there is one; a photo
// without one yet is cut here by lib/photo-cutout.ts. Only photos in Drive's own
// storage are fetched. A ready-made cutout never changes for a given photo
// URL (they carry a version), so it's cached for a year by browsers and
// Vercel's CDN; one cut here is only kept for an hour, so the clean version
// takes its place once it's made.
// On any failure the shopper gets the original photo instead.
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cutoutPhoto } from "@/lib/photo-cutout";
import { isCutoutSource } from "@/lib/photo-src";

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src") ?? "";
  if (!isCutoutSource(src)) return new NextResponse("Not a listing photo", { status: 400 });
  const cached = {
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
  };
  for (const variant of [src, src.split("?")[0]]) {
    try {
      const key = createHash("sha1").update(variant).digest("hex");
      const ready = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/car-photos/cutouts/${key}.webp`, {
        signal: AbortSignal.timeout(8000),
      });
      if (ready.ok && (ready.headers.get("content-type") ?? "").startsWith("image/")) {
        return new NextResponse(new Uint8Array(await ready.arrayBuffer()), { headers: cached });
      }
    } catch {
      // Try the next key, then make one below.
    }
    if (!src.includes("?")) break;
  }
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(10000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return NextResponse.redirect(src, 302);
    const input = Buffer.from(await res.arrayBuffer());
    if (input.length > MAX_BYTES) return NextResponse.redirect(src, 302);
    const out = await cutoutPhoto(input);
    return new NextResponse(new Uint8Array(out), {
      headers: { ...cached, "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (err) {
    console.error("photo cutout failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(src, 302);
  }
}
