require("dotenv").config({ path: ".env.local" });
const { sql } = require("@vercel/postgres");
const fs = require("fs");
const path = require("path");

const ID = process.argv[2];
const NAME = process.argv[3] || "patio";

function writeDataUrl(dataUrl, basePath) {
  const m = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/s);
  if (!m) throw new Error("Not a data URL: " + dataUrl.slice(0, 40));
  const ext = m[1] === "image/png" ? "png" : "jpg";
  const file = `${basePath}.${ext}`;
  fs.writeFileSync(file, Buffer.from(m[2], "base64"));
  return file;
}

(async () => {
  const { rows } = await sql`
    SELECT original_image_url, generated_image_url FROM designs WHERE id = ${ID}`;
  if (!rows[0]) throw new Error("Design not found");
  const dir = path.join("public", "samples");
  fs.mkdirSync(dir, { recursive: true });
  const before = writeDataUrl(rows[0].original_image_url, path.join(dir, `${NAME}-before`));
  const after = writeDataUrl(rows[0].generated_image_url, path.join(dir, `${NAME}-after`));
  console.log("Wrote:", before, after);
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
