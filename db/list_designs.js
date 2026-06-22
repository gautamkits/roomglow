require("dotenv").config({ path: ".env.local" });
const { sql } = require("@vercel/postgres");
(async () => {
  const { rows } = await sql`
    SELECT id, mode, design_narrative,
           length(original_image_url) AS orig_len,
           length(generated_image_url) AS gen_len,
           created_at
    FROM designs ORDER BY created_at DESC LIMIT 12`;
  rows.forEach((r, i) =>
    console.log(
      `[${i}] id=${r.id} ${r.mode} orig:${r.orig_len} gen:${r.gen_len} | ${(r.design_narrative || "").slice(0, 60)}`
    )
  );
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
