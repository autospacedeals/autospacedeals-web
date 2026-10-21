// Seller logos (supabase/migrations/0051_broker_logos.sql): an upload is
// squared on its own background (squareLogo), saved as WebP in the public
// broker-logos bucket, and its address stored on brokers.logo_url.
// Replacing or removing a logo deletes the old file.
// SERVER-ONLY.
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "broker-logos";
export const MAX_LOGO_BYTES = 4 * 1024 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// The storage path inside the bucket, from a logo_url of ours.
function pathOf(url: string | null): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  return url && i >= 0 ? url.slice(i + marker.length).split("?")[0] : null;
}

// The logo centered on a square of its own background (white behind a
// transparent one), so its tile is one color edge to edge: a logo on black
// gets a black tile.
async function squareLogo(image: Buffer): Promise<Buffer> {
  const source = await sharp(image, { animated: false }).rotate().toBuffer();
  const corner = await sharp(source).ensureAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  const background = corner[3] < 250 ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: corner[0], g: corner[1], b: corner[2], alpha: 1 };
  const mark = await sharp(source)
    .trim({ threshold: 4 })
    .resize({ width: 430, height: 430, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  // The mark fills about 84% of the square's longer side.
  const side = Math.max(Math.round(Math.max(mark.info.width, mark.info.height) / 0.84), 1);
  return sharp({ create: { width: side, height: side, channels: 4, background } })
    .composite([{ input: mark.data, gravity: "center" }])
    .flatten({ background })
    .resize({ width: 512, height: 512, withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}

export async function saveBrokerLogo(brokerId: string, image: Buffer): Promise<{ url: string | null; error: string | null }> {
  let webp: Buffer;
  try {
    webp = await squareLogo(image);
  } catch {
    return { url: null, error: "We couldn't read that image. Try a PNG or JPG." };
  }
  const admin = createAdminClient();
  const { data: before } = await admin.from("brokers").select("logo_url").eq("id", brokerId).maybeSingle<{ logo_url: string | null }>();
  const path = `${brokerId}/${randomBytes(6).toString("hex")}.webp`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, webp, { contentType: "image/webp", cacheControl: "31536000" });
  if (uploadError) return { url: null, error: uploadError.message };
  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error } = await admin.from("brokers").update({ logo_url: url }).eq("id", brokerId);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { url: null, error: error.message };
  }
  const old = pathOf(before?.logo_url ?? null);
  if (old) await admin.storage.from(BUCKET).remove([old]);
  return { url, error: null };
}

export async function removeBrokerLogo(brokerId: string): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { data: before } = await admin.from("brokers").select("logo_url").eq("id", brokerId).maybeSingle<{ logo_url: string | null }>();
  const { error } = await admin.from("brokers").update({ logo_url: null }).eq("id", brokerId);
  if (error) return { error: error.message };
  const old = pathOf(before?.logo_url ?? null);
  if (old) await admin.storage.from(BUCKET).remove([old]);
  return { error: null };
}
