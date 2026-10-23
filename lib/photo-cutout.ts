// Listing photos are studio shots on a white backdrop. On the paper (light)
// theme they sit fine multiplied onto the page, but on the dark theme the white
// shows as a box. cutoutPhoto() turns the backdrop transparent: it
// flood-fills near-white from the image's edges (so white paint inside the
// car's outline survives), lifts the pale floor shadow under the car too,
// softens the outline and pulls the white fringe out of it. Photos without
// a white backdrop (a car on a lot) have nothing connected to the edges to
// remove and come back unchanged, apart from the format.
import sharp from "sharp";

// Backdrop: within this much of the photo's own backdrop white (measured
// from its corners — studio shots are 255, some sellers' ~250), so bright
// white paint just inside the outline isn't mistaken for it.
const WHITE_MARGIN = 5;
const SHADOW_MIN = 110; // darkest grey still counted as floor shadow
const SHADOW_SPREAD = 16; // max channel spread for "neutral"
const SHADOW_STEP = 5; // max brightness change between neighbouring shadow pixels

// Small studio shots (640px) are enlarged before cutting, so the outline
// can be softened at the bigger size instead of showing pixel steps when the
// photo is shown large.
const WORK_WIDTH = 1400;

export async function cutoutPhoto(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const scale = meta.width && meta.width < WORK_WIDTH ? Math.min(2, WORK_WIDTH / meta.width) : 1;
  const base = sharp(input).removeAlpha();
  const { data, info } = await (scale > 1
    ? base.resize(Math.round(meta.width! * scale), null, { kernel: "lanczos3" })
    : base
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const bg = new Uint8Array(n);
  const corners = [0, w - 1, (h - 1) * w, n - 1, Math.floor(w / 2), (h - 1) * w + Math.floor(w / 2)].map(
    (p) => Math.min(data[p * 3], data[p * 3 + 1], data[p * 3 + 2])
  );
  const backdropWhite = corners.sort((a, b) => a - b)[3];
  // Not a studio shot at all (a car on a lot): leave it.
  if (backdropWhite < 235) return sharp(input).webp({ quality: 82 }).toBuffer();
  const WHITE = backdropWhite - WHITE_MARGIN;
  const white = (p: number) => data[p * 3] >= WHITE && data[p * 3 + 1] >= WHITE && data[p * 3 + 2] >= WHITE;

  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (bg[p] || !white(p)) continue;
    bg[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }

  // Not a studio shot: too little of it is backdrop to be worth cutting.
  let backdrop = 0;
  for (let p = 0; p < n; p++) backdrop += bg[p];
  if (backdrop < n * 0.12) return sharp(input).webp({ quality: 82 }).toBuffer();

  // Floor shadow: the soft grey under the car. It's followed out from the
  // backdrop, below the car's mid-line, only through neutral grey that
  // changes gradually (a shadow fades smoothly; the car's own outline is a
  // sharp step), so it stops at the bumper and tyres instead of running into
  // white or silver paint. It's kept as a real shadow: black, as see-through
  // as it was light.
  const lum = (p: number) => (data[p * 3] + data[p * 3 + 1] + data[p * 3 + 2]) / 3;
  const neutral = (p: number) => {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) < SHADOW_SPREAD;
  };
  const shade = new Uint8Array(n);
  // Only around the tyres' level: the lowest rows with a run of very dark
  // pixels (tyres) mark where the car meets the floor, so the shadow can't
  // climb up into a white bumper.
  let tyres = Math.floor(h * 0.85);
  for (let y = h - 1; y > h * 0.4; y--) {
    let dark = 0;
    for (let x = 0; x < w; x++) if (lum(y * w + x) < 60) dark++;
    if (dark > w * 0.005) {
      tyres = y;
      break;
    }
  }
  const floor = Math.max(Math.floor(h * 0.5), tyres - Math.round(h * 0.08));
  for (let p = floor * w; p < n; p++) if (bg[p]) stack.push(p);
  const seen = new Uint8Array(n);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    const from = lum(p);
    const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > floor ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of next) {
      if (q < 0 || seen[q] || bg[q]) continue;
      const l = lum(q);
      // Right at tyre level the floor is noisier (JPEG blocks in the
      // shadow), and there's no bodywork to protect: allow bigger steps.
      const step = ((q / w) | 0) >= tyres - Math.round(h * 0.02) ? SHADOW_STEP * 2.5 : SHADOW_STEP;
      if (neutral(q) && l >= SHADOW_MIN && Math.abs(l - from) <= step) {
        shade[q] = 1;
        stack.push(q);
      }
    }
  }

  // Bright floor left between the shadow and the tyres (a white strip under
  // the car): near-white touching the backdrop or shadow, at floor level.
  // (This one reaches a little higher: the strip sits under the sills.)
  const sills = Math.max(Math.floor(h * 0.45), tyres - Math.round(h * 0.15));
  for (let p = sills * w; p < n; p++) if (bg[p] || shade[p]) stack.push(p);
  const seen2 = new Uint8Array(n);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen2[p]) continue;
    seen2[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > sills ? p - w : -1, y < h - 1 ? p + w : -1]) {
      if (q < 0 || seen2[q] || bg[q] || shade[q]) continue;
      if (neutral(q) && lum(q) >= WHITE - 4) {
        bg[q] = 1;
        stack.push(q);
      }
    }
  }

  // Shave one pixel off the car's outline (the JPEG blends its edge with
  // the backdrop, which would show as a light fringe), then soften it.
  // Last, the floor right at the tyres' contact line: any pale neutral
  // grey there is shadow (the tyres themselves are dark, the rims sit
  // higher up).
  const contact = Math.max(0, tyres - Math.round(h * 0.03));
  for (let p = contact * w; p < n; p++) {
    if (!bg[p] && !shade[p] && neutral(p) && lum(p) >= 150) shade[p] = 1;
  }

  const solid = (p: number) => !bg[p] && !shade[p];
  const alpha = Buffer.alloc(n);
  for (let p = 0; p < n; p++) {
    const x = p % w;
    const y = (p / w) | 0;
    const inside =
      solid(p) && (x === 0 || solid(p - 1)) && (x === w - 1 || solid(p + 1)) && (y === 0 || solid(p - w)) && (y === h - 1 || solid(p + w));
    alpha[p] = inside ? 255 : 0;
  }
  const soft = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(scale > 1 ? 1.6 : 1.1).extractChannel(0).raw().toBuffer();

  const rgba = Buffer.alloc(n * 4);
  for (let p = 0; p < n; p++) {
    const a = soft[p] / 255;
    let r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    if (a > 0 && a < 1) {
      // Un-mix the white backdrop out of the soft edge.
      r = Math.max(0, Math.min(255, (r - 255 * (1 - a)) / a));
      g = Math.max(0, Math.min(255, (g - 255 * (1 - a)) / a));
      b = Math.max(0, Math.min(255, (b - 255 * (1 - a)) / a));
    }
    // The shadow: black at the strength of its grey.
    const shadowA = shade[p] ? Math.min(1, Math.max(0, (250 - lum(p)) / 160)) * 0.85 : 0;
    if (shadowA > a) {
      r = g = b = 0;
      rgba[p * 4 + 3] = Math.round(shadowA * 255);
    } else {
      rgba[p * 4 + 3] = Math.round(a * 255);
    }
    rgba[p * 4] = r;
    rgba[p * 4 + 1] = g;
    rgba[p * 4 + 2] = b;
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
}
