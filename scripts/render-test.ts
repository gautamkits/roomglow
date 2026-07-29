/**
 * Isolated render harness — test room fidelity without production.
 *
 * Calls the REAL generateDesignImage from src/lib/gemini.ts (so it exercises
 * the actual prompt, not a copy) against a local photo, then reports whether
 * the output kept the input's aspect ratio and writes the PNG for eyeballing.
 *
 * Why this exists: every fidelity test so far has meant running a full design
 * in production — slow, ~6 AI calls, on real users, and you only find out
 * afterwards. This is ONE image call against a fixed photo, so a change can be
 * tested repeatedly and attributed.
 *
 * Accepts a local path OR a URL (a design's stored original_image_url is a
 * public Blob link, so a real user's photo can be tested without saving files).
 *
 * Usage:
 *   npx tsx scripts/render-test.ts public/samples/kitchen-before.jpg
 *   npx tsx scripts/render-test.ts "<blob-url>" --analyze --runs=0   # analyze only, ~free
 *   npx tsx scripts/render-test.ts <photo> --analyze                 # analyze + 1 render
 *   npx tsx scripts/render-test.ts <photo> --runs=3                  # check consistency
 *
 * --runs=0 skips image generation entirely, so the analyzer can be tested for
 * roughly nothing (one gemini-2.5-flash call) before spending on a render.
 *
 * Output lands in .render-test/ (gitignored).
 */
import dotenv from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, extname } from "path";
import sharp from "sharp";

// Must load before importing gemini.ts — it reads GOOGLE_AI_API_KEY at module
// load time, and ESM imports hoist above ordinary statements.
dotenv.config({ path: ".env.local" });
if (!process.env.GOOGLE_AI_API_KEY) {
  console.error("GOOGLE_AI_API_KEY missing — expected it in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const photoArg = args.find((a) => !a.startsWith("--"));
if (!photoArg) {
  console.error("Usage: npx tsx scripts/render-test.ts <photo> [--products=N] [--event=birthday] [--runs=N]");
  process.exit(1);
}
// Re-bind so the type is `string` inside main() — TS doesn't carry the
// narrowing above across the function boundary.
const photoPath: string = photoArg;
const flag = (name: string, dflt: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? dflt;

const productCount = parseInt(flag("products", "6"), 10);
const eventName = flag("event", "birthday");
const runs = parseInt(flag("runs", "1"), 10);
// Run analyzeRoom first and use its suggestions, instead of the hardcoded list.
const useAnalyze = args.includes("--analyze");
// Resolve suggestions to real Amazon products and render with their catalog
// photos as references (implies --analyze). Needs RAPIDAPI_KEY.
const useAmazon = args.includes("--amazon");

/**
 * Text-only products (no imageUrl) on purpose: it removes the 6-8 reference
 * images as a variable, so a failure here is the room prompt alone. Pass real
 * Amazon image URLs later to test whether reference count drives infidelity.
 */
const PRODUCTS = [
  { category: "Backdrop panel", placement: "centred on the main wall", title: `${eventName} backdrop cloth`, colorSuggestion: "pastel", imageUrl: "" },
  { category: "Balloon garland", placement: "arcing across the top of the main wall", title: "balloon garland arch kit 100 pcs", colorSuggestion: "pastel mix", imageUrl: "" },
  { category: "Foil balloon", placement: "centred on the main wall at eye level", title: "number foil balloon", colorSuggestion: "silver", imageUrl: "" },
  { category: "Fairy lights", placement: "along the wall edges", title: "warm white fairy string lights", colorSuggestion: "warm white", imageUrl: "" },
  { category: "Hanging danglers", placement: "hanging from the ceiling near the main wall", title: "hanging swirl ceiling decorations", colorSuggestion: "pastel", imageUrl: "" },
  { category: "Themed props", placement: "against the base of the main wall", title: `${eventName} party props cutouts`, colorSuggestion: "themed", imageUrl: "" },
].slice(0, productCount);

const EVENT_CONTEXT =
  `This space will host a Birthday with a "${eventName}" theme using a pastel color scheme. ` +
  `All signage and décor must match a Birthday — never a different occasion.`;

/** Accept a local path or a URL — the stored original of a real design is a public Blob link. */
async function loadPhoto(src: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${res.status} for ${src}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(src);
}

async function main() {
  const { generateDesignImage, analyzeRoom } = await import("../src/lib/gemini");

  const inputBuf = await loadPhoto(photoPath);
  const inMeta = await sharp(inputBuf).metadata();
  const inRatio = (inMeta.width ?? 0) / (inMeta.height ?? 1);

  mkdirSync(".render-test", { recursive: true });
  const stem = basename(photoPath.split("?")[0], extname(photoPath.split("?")[0])) || "photo";

  console.log(`\nphoto     ${photoPath}`);
  console.log(`input     ${inMeta.width}x${inMeta.height}  ratio=${inRatio.toFixed(3)}`);

  // --analyze runs the REAL analyzeRoom and uses its suggestions as the product
  // list. Without this the harness feeds a hardcoded list straight to the
  // renderer and never exercises analyzeRoom at all — so it could not test a
  // change to what the analyzer is allowed to suggest.
  let products = PRODUCTS;
  if (useAnalyze) {
    const started = Date.now();
    const raw = await analyzeRoom(inputBuf.toString("base64"), EVENT_CONTEXT);
    const analysis = JSON.parse(raw) as {
      existingFurniture?: string[];
      suggestedProducts?: { label: string; description: string }[];
    };
    const suggested = analysis.suggestedProducts ?? [];
    console.log(`analyze   ${suggested.length} suggestions in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(`sees      ${(analysis.existingFurniture ?? []).join(", ") || "(nothing)"}`);
    for (const s of suggested) console.log(`   • ${s.label} — ${s.description}`);
    // Flag the categories that need a surface a photo may not contain. This is
    // the cheap signal: if these vanish for a photo with no visible ceiling or
    // table, the analyzer guard is working.
    // Deliberately NOT matching a bare "hang" — a banner hangs on a wall, which
    // is fine. Only flag things that need a ceiling, or a table that may not exist.
    const risky = suggested.filter((s) =>
      /ceiling|dangler|swirl|pom.?pom|chandelier|centerpiece|(cake|dessert)[\s-]*(table|stand)/i.test(
        `${s.label} ${s.description}`
      )
    );
    console.log(
      risky.length
        ? `\n⚠  ${risky.length} suggestion(s) need a ceiling/table surface: ${risky.map((r) => r.label).join(", ")}`
        : `\n✓  no ceiling/table-dependent suggestions`
    );
    products = suggested.map((s) => ({
      category: s.label,
      placement: s.description,
      title: s.label,
      colorSuggestion: "themed",
      imageUrl: "",
    }));

    // --amazon: resolve each suggestion to a real Amazon product and use its
    // catalog photo as the render reference, like production does. Also PROBES
    // each image URL server-side, because a failed fetch silently downgrades
    // that product to the text fallback — which describes the colour the
    // designer WANTED, not the colour the product actually is. That mismatch is
    // what makes a rendered blue balloon link to a pink one.
    if (useAmazon) {
      const { searchProducts } = await import("../src/lib/amazon");
      const resolved: typeof products = [];
      let imgFail = 0;
      console.log(`\nresolving to real Amazon products (locale IN)…`);
      for (const s of suggested) {
        const cands = await searchProducts(s.label, 5, "IN");
        const top = cands[0];
        if (!top) {
          console.log(`   ✗ no Amazon result — ${s.label}`);
          continue;
        }
        let ok = false;
        let note = "no imageUrl";
        if (top.imageUrl) {
          try {
            const r = await fetch(top.imageUrl);
            ok = r.ok;
            note = `HTTP ${r.status}`;
          } catch (e) {
            note = (e as Error).message.slice(0, 40);
          }
        }
        if (!ok) imgFail++;
        console.log(
          `   ${ok ? "✓" : "✗"} ${s.label}\n       -> "${top.title.slice(0, 70)}" ${top.price}  [ref image: ${note}]`
        );
        resolved.push({
          category: s.label,
          placement: s.description,
          title: top.title,
          colorSuggestion: "themed",
          imageUrl: top.imageUrl,
        });
      }
      console.log(
        `\nreference images: ${resolved.length - imgFail}/${resolved.length} fetched OK` +
          (imgFail ? `  ⚠ ${imgFail} will fall back to TEXT (wrong-colour risk)` : "")
      );
      if (resolved.length) products = resolved;
    }
  }

  console.log(
    `products  ${products.length} (${products.some((p) => p.imageUrl) ? "with Amazon reference images" : "text-only, no reference images"})`
  );
  console.log(`runs      ${runs}\n`);

  if (runs === 0) {
    console.log("--runs=0 → analyze only, no image generated (no image-gen cost).\n");
    return;
  }

  for (let i = 1; i <= runs; i++) {
    const started = Date.now();
    try {
      const { generatedImage } = await generateDesignImage(
        inputBuf.toString("base64"),
        products,
        EVENT_CONTEXT,
        undefined,
        false, // skip hotspot detection — saves a call, irrelevant to fidelity
        undefined,
        false
      );
      const outBuf = Buffer.from(generatedImage, "base64");
      const outMeta = await sharp(outBuf).metadata();
      const outRatio = (outMeta.width ?? 0) / (outMeta.height ?? 1);
      const drift = Math.abs(outRatio - inRatio) / inRatio;

      const out = `.render-test/${stem}-run${i}.png`;
      writeFileSync(out, outBuf);

      const verdict = drift < 0.02 ? "ASPECT OK" : `ASPECT DRIFTED ${(drift * 100).toFixed(1)}%`;
      console.log(
        `run ${i}  ${outMeta.width}x${outMeta.height}  ratio=${outRatio.toFixed(3)}  ${verdict}  ${((Date.now() - started) / 1000).toFixed(1)}s  -> ${out}`
      );
    } catch (e) {
      console.log(`run ${i}  FAILED after ${((Date.now() - started) / 1000).toFixed(1)}s: ${(e as Error).message}`);
    }
  }

  console.log(
    `\nOpen the PNGs and check the room itself, not just the numbers:\n` +
      `  - are the windows where they were, and no new ones?\n` +
      `  - is the furniture in the same place, at the same size?\n` +
      `  - same camera position, or has it zoomed out to show ceiling/side walls?\n`
  );
}

main();
