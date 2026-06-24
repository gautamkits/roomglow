// One-off: move existing base64 data-URL images into public Vercel Blob,
// generate blur placeholders, and replace the DB columns with Blob URLs.
// Idempotent: skips rows whose URLs are already http(s).
require("dotenv").config({ path: ".env.local" });
const { sql } = require("@vercel/postgres");
const { put } = require("@vercel/blob");
const sharp = require("sharp");

function toBuffer(dataUrl) {
  const m = dataUrl.match(/^data:(image\/\w+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2], "base64") };
}

async function blur(buf) {
  const out = await sharp(buf).resize(16, 16, { fit: "inside" }).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

async function upload(buf, mime, name) {
  const ext = mime === "image/png" ? "png" : "jpg";
  const res = await put(`designs/migrated/${name}.${ext}`, buf, {
    access: "public",
    contentType: mime,
    addRandomSuffix: true,
  });
  return res.url;
}

(async () => {
  const { rows } = await sql`
    SELECT id, original_image_url, generated_image_url
    FROM designs
    WHERE original_image_url LIKE 'data:%' OR generated_image_url LIKE 'data:%'
  `;
  console.log(`Found ${rows.length} design(s) to migrate.`);

  let done = 0;
  for (const d of rows) {
    try {
      const updates = {};
      if (d.original_image_url?.startsWith("data:")) {
        const o = toBuffer(d.original_image_url);
        if (o) {
          updates.original_image_url = await upload(o.buf, o.mime, `${d.id}-original`);
          updates.original_blur = await blur(o.buf);
        }
      }
      if (d.generated_image_url?.startsWith("data:")) {
        const g = toBuffer(d.generated_image_url);
        if (g) {
          updates.generated_image_url = await upload(g.buf, g.mime, `${d.id}-generated`);
          updates.generated_blur = await blur(g.buf);
        }
      }
      await sql`
        UPDATE designs SET
          original_image_url = COALESCE(${updates.original_image_url ?? null}, original_image_url),
          generated_image_url = COALESCE(${updates.generated_image_url ?? null}, generated_image_url),
          original_blur = COALESCE(${updates.original_blur ?? null}, original_blur),
          generated_blur = COALESCE(${updates.generated_blur ?? null}, generated_blur)
        WHERE id = ${d.id}
      `;
      done++;
      console.log(`  [${done}/${rows.length}] ${d.id} migrated`);
    } catch (e) {
      console.error(`  FAILED ${d.id}:`, e.message);
    }
  }
  console.log(`Done. Migrated ${done}/${rows.length}.`);
  process.exit(0);
})().catch((e) => {
  console.error("Migration error:", e.message);
  process.exit(1);
});
