// One-off: generate a maskable PWA icon from the square app icon.
// Android adaptive icons crop to a circle/squircle, so the logo is scaled to
// ~72% and centered on a Linen (#faf6f0) canvas to stay inside the safe zone.
// Run: node scripts/make-maskable.mjs
import sharp from "sharp";

const SIZE = 512;
const INNER = Math.round(SIZE * 0.72);

const logo = await sharp("public/icons/icon-512.png")
  .resize(INNER, INNER, { fit: "contain", background: { r: 250, g: 246, b: 240, alpha: 1 } })
  .toBuffer();

await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 250, g: 246, b: 240, alpha: 1 },
  },
})
  .composite([{ input: logo, gravity: "center" }])
  .png()
  .toFile("public/icons/icon-maskable-512.png");

console.log("Wrote public/icons/icon-maskable-512.png");
