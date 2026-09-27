// Regenerates Drive's raster brand files from the SVG sources in public/brand,
// using the repo's own `sharp` (already a dependency — nothing to install).
//
// The rendered files are ALSO delivered ready-made in design/final/icons/, so
// running this is only needed if the SVGs change. Run from the repo root:
//
//   node scripts/make-brand-assets.mjs
//
// Writes: app/apple-icon.png (180×180, full-bleed; iOS rounds the corners)
//         app/favicon.ico    (16/32/48 PNG-in-ICO)
//         app/opengraph-image.png (1200×630)
import fs from "node:fs";
import sharp from "sharp";

const SRC = "public/brand";

async function png(file, w, h = w, density = 1200) {
  return sharp(fs.readFileSync(`${SRC}/${file}`), { density }).resize(w, h).png().toBuffer();
}

function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, buf }, i) => {
    const o = 6 + 16 * i;
    header.writeUInt8(size, o); // width
    header.writeUInt8(size, o + 1); // height
    header.writeUInt8(0, o + 2); // palette
    header.writeUInt8(0, o + 3); // reserved
    header.writeUInt16LE(1, o + 4); // planes
    header.writeUInt16LE(32, o + 6); // bpp
    header.writeUInt32LE(buf.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.buf)]);
}

fs.writeFileSync("app/apple-icon.png", await png("drive-app-icon-square.svg", 180));
const sizes = [16, 32, 48];
const icoImages = [];
for (const size of sizes) icoImages.push({ size, buf: await png("drive-app-icon.svg", size) });
fs.writeFileSync("app/favicon.ico", ico(icoImages));
fs.writeFileSync("app/opengraph-image.png", await png("drive-og.svg", 1200, 630, 144));
console.log("wrote app/apple-icon.png, app/favicon.ico, app/opengraph-image.png");
