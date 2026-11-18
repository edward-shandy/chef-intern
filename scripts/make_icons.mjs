// Draws the app icon (a white chef's toque on a tomato-red tile) as PNGs for the home screen and the web app manifest.
// Pure Node: shapes are tested per pixel with 4x4 supersampling and written with zlib, so no image library is needed.
//
// Usage: node scripts/make_icons.mjs

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const RED = [210, 65, 31];
const WHITE = [255, 250, 240];
const SHADE = [236, 222, 200];
const INK = [36, 29, 48];

// The design on a 1 x 1 square; returns the colour at (x, y), or null for the transparent corners.
function colourAt(x, y, rounded) {
  const r = 0.22;
  if (rounded) {
    const cx = Math.min(Math.max(x, r), 1 - r);
    const cy = Math.min(Math.max(y, r), 1 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null;
  }
  const inCircle = (cx, cy, radius) => Math.hypot(x - cx, y - cy) <= radius;
  const band = x >= 0.31 && x <= 0.69 && y >= 0.5 && y <= 0.7;
  const puff = inCircle(0.37, 0.43, 0.15) || inCircle(0.63, 0.43, 0.15) || inCircle(0.5, 0.33, 0.18);
  // A thin dark seam between the puffy top and the band.
  if (x >= 0.31 && x <= 0.69 && y >= 0.5 && y <= 0.525) return INK;
  // A soft shadow under the puffs, just above the band.
  if (puff && !band && y > 0.46) return SHADE;
  if (band || puff) return WHITE;
  return RED;
}

function png(size, rounded) {
  const samples = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const colour = colourAt((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size, rounded);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 1;
        }
      }
      const offset = 1 + px * 4;
      row[offset] = a ? r / a : 0;
      row[offset + 1] = a ? g / a : 0;
      row[offset + 2] = a ? b / a : 0;
      row[offset + 3] = (a / (samples * samples)) * 255;
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// iOS rounds the corners itself and wants a square; the manifest icons carry their own rounding.
for (const [name, size, rounded] of [
  ["apple-touch-icon.png", 180, false],
  ["icon-192.png", 192, true],
  ["icon-512.png", 512, true],
  // The browser tab: an SVG favicon for modern browsers, with this PNG and the .ico below for the rest.
  ["favicon-32.png", 32, true],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, rounded));
  console.log(`wrote public/${name}`);
}

// favicon.ico for browsers (and bookmark tools) that ask for /favicon.ico directly: an ICO container holding PNG
// images at 16, 32 and 48 pixels, which every current browser reads.
const sizes = [16, 32, 48];
const images = sizes.map((size) => png(size, true));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(images[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return entry;
});
writeFileSync(new URL("../public/favicon.ico", import.meta.url), Buffer.concat([header, ...entries, ...images]));
console.log("wrote public/favicon.ico");
