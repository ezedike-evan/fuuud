/**
 * Renders the brand mark into every icon the site serves. Run after changing lib/brand-mark.ts:
 *   node --experimental-strip-types scripts/make-icons.mts
 * Output is committed, so a build never depends on this script or on sharp.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { markSvg } from "../lib/brand-mark.ts";
import { buildIco } from "../lib/ico.ts";

const png = (svg: string, size: number) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

mkdirSync("public", { recursive: true });
mkdirSync("brand", { recursive: true });

// Browser tab: the bare mark, so it uses the whole 16 px, on any tab colour.
const bare = markSvg({ variant: "small" });
writeFileSync("app/icon.svg", bare);
writeFileSync("brand/mark.svg", markSvg({ variant: "full" }));
writeFileSync("brand/mark-small.svg", bare);
const ico = buildIco(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: new Uint8Array(await png(bare, size)) }))));
writeFileSync("app/favicon.ico", ico);

// Opaque tiles for places that cannot be transparent.
const tile = markSvg({ variant: "full", tile: true });
const writes: [string, Buffer][] = [
  ["app/apple-icon.png", await png(markSvg({ variant: "full", tile: true, radius: 0, scale: 0.78 }), 180)], // iOS rounds it itself
  ["public/icon-192.png", await png(tile, 192)],
  ["public/icon-512.png", await png(tile, 512)],
  ["public/icon-maskable-512.png", await png(markSvg({ variant: "full", tile: true, radius: 0, scale: 0.58 }), 512)],
  ["brand/logo-120.png", await png(tile, 120)],
  ["brand/mark-512.png", await sharp(Buffer.from(markSvg({ variant: "full" })), { density: 600 }).resize(512, 512).png().toBuffer()],
];
for (const [path, buf] of writes) writeFileSync(path, buf);
console.log("icons written:", ["app/icon.svg", "app/favicon.ico", ...writes.map(([p]) => p)].join(", "));
