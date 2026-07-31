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
 *   npx tsx scripts/render-test.ts <photo> --analyze --recommend --runs=0
 *   npx tsx scripts/render-test.ts <photo> --analyze --occasion=ganesh_chaturthi --runs=0
 *
 * --runs=0 skips image generation entirely, so the analyzer can be tested for
 * roughly nothing (one gemini-2.5-flash call) before spending on a render.
 *
 * --recommend adds the recommendProducts step — the stage that turns suggestions
 * into Amazon search queries. It is where a "balloon arch kit 200 pcs" query is
 * born, and it was untested by anything before this flag existed. Still only
 * gemini-2.5-flash, so it stays in the ~free tier with --runs=0.
 *
 * Output lands in .render-test/ (gitignored).
 */
import dotenv from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, extname } from "path";
import sharp from "sharp";
import { buildEventContext, getEvent } from "../src/lib/events";

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
  console.error(
    "Usage: npx tsx scripts/render-test.ts <photo> [--analyze] [--recommend] [--amazon]\n" +
      "       [--occasion=birthday] [--theme=Jungle] [--colors=\"Pastel mix\"] [--locale=IN]\n" +
      "       [--products=N] [--runs=N]"
  );
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
// Which EVENTS entry to build the brief from. Festivals decorate nothing like
// birthdays, so a change that looks fine on a birthday can still wreck
// ganesh_chaturthi — that case needs to be runnable.
const occasionId = flag("occasion", "birthday");
const subTheme = flag("theme", "Jungle");
const colorScheme = flag("colors", "Pastel mix");
const locale = flag("locale", "IN") === "US" ? "US" : "IN";
// Run analyzeRoom first and use its suggestions, instead of the hardcoded list.
const useAnalyze = args.includes("--analyze");
// Run recommendProducts on the suggestions and print the Amazon queries it
// writes (implies --analyze). gemini-2.5-flash only — no image cost.
const useRecommend = args.includes("--recommend");
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

/**
 * The event brief, built by PRODUCTION's own buildEventContext.
 *
 * This used to be a hardcoded copy of that string, and it had already drifted —
 * it was missing the "never another country's version of the same-named holiday"
 * clause added in 515d180. A harness testing a stale copy of the prompt tests
 * nothing, so call the real thing. events.ts reads no env, so importing it at
 * module scope is safe (unlike gemini.ts, see the dotenv note above).
 */
const event = getEvent(occasionId);
if (!event) {
  console.error(`Unknown --occasion=${occasionId}. See EVENTS in src/lib/events.ts.`);
  process.exit(1);
}
const EVENT_CONTEXT = buildEventContext({
  eventType: event.id,
  eventLabel: event.label,
  subTheme,
  colorScheme,
})!;

/**
 * Families the décor should be drawn from. Reported per run so a prompt change
 * can be judged on what it produced, not just on what it stopped producing —
 * a design with zero balloons and zero of these is a regression, not a win.
 * Tested against non-balloon suggestions only, so "balloon garland" cannot
 * count as a floral.
 */
const FAMILIES: [string, RegExp][] = [
  ["fabric", /fabric|drape|backdrop|curtain|cloth|skirt|runner|sheer|satin/i],
  ["floral", /floral|flower|marigold|genda|garland|toran|greenery|leaf|vase|petal/i],
  ["lights", /light|lantern|diya|candle|fairy|led|lamp/i],
  ["paper", /paper|honeycomb|fan|tassel|bunting|banner|cutout|sign|standee|rangoli|decal|streamer/i],
];

/**
 * Query shapes that mean hours of inflation for the user. Two kinds:
 * explicit bulk packs, and balloon STRUCTURES — "balloon arch" contains no
 * piece count and reads innocent, but an arch is 100+ balloons by definition.
 */
const BANNED_QUERY =
  /arch kit|garland kit|combo kit|\b\d{2,}\s*(pcs|pieces|pc)\b|balloon\s*(arch|garland|wall|pillar|column|backdrop)/i;

/** Is this suggestion itself a balloon product? Matched on the LABEL only — a
 *  fairy-light item whose description says "outline the balloon arch" is not a
 *  balloon slot, and counting it as one hides the real number. */
const isBalloon = (s: { label: string }) => /balloon/i.test(s.label);

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
    // Keep the WHOLE analysis, not two fields — --recommend feeds it back into
    // recommendProducts, which reads roomType/currentStyle/dimensions/lighting.
    const analysis = JSON.parse(raw) as {
      existingFurniture?: string[];
      suggestedProducts?: { label: string; description: string }[];
      [k: string]: unknown;
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

    // Balloon budget. These prompts are stochastic, so one run proves nothing —
    // run this 5+ times and compare the counts, not a single verdict.
    const balloons = suggested.filter(isBalloon);
    console.log(
      balloons.length <= 1
        ? `✓  balloons ${balloons.length}/${suggested.length} suggestions (cap 1)`
        : `✗  BALLOON CAP EXCEEDED — ${balloons.length}/${suggested.length} suggestions: ${balloons.map((b) => b.label).join(", ")}`
    );

    // What replaced the balloon volume. Zero balloons AND zero families means
    // the design went sparse, which is the regression this change risks most.
    const nonBalloon = suggested.filter((s) => !isBalloon(s));
    const present = FAMILIES.filter(([, re]) =>
      nonBalloon.some((s) => re.test(`${s.label} ${s.description}`))
    ).map(([name]) => name);
    console.log(
      present.length
        ? `${present.length >= 2 ? "✓" : "⚠"}  families ${present.length}/4: ${present.join(", ")}`
        : `✗  NO alternative décor families present — design will look sparse`
    );

    products = suggested.map((s) => ({
      category: s.label,
      placement: s.description,
      title: s.label,
      colorSuggestion: "themed",
      imageUrl: "",
    }));

    // --recommend: the missing middle. Production turns these suggestions into
    // Amazon SEARCH QUERIES via recommendProducts, and that is what decides what
    // the user actually buys — a "balloon arch kit 200 pcs" query is 200 balloons
    // to inflate no matter how restrained the render looks. Nothing tested this
    // stage before. Text model only, so it is ~free.
    if (useRecommend) {
      const { recommendProducts } = await import("../src/lib/gemini");
      const started2 = Date.now();
      const recRaw = await recommendProducts(
        analysis as never,
        {},
        suggested.map((s) => s.label),
        EVENT_CONTEXT,
        [],
        locale
      );
      const rec = JSON.parse(recRaw) as {
        products?: { category: string; searchQuery: string; placement: string }[];
        designVision?: string;
      };
      const recs = rec.products ?? [];
      console.log(`\nrecommend ${recs.length} products in ${((Date.now() - started2) / 1000).toFixed(1)}s  (${locale})`);
      for (const p of recs) {
        const bad = BANNED_QUERY.test(p.searchQuery);
        console.log(`   ${bad ? "✗" : " "} ${p.category}\n       -> "${p.searchQuery}"  @ ${p.placement}`);
      }
      const balloonQ = recs.filter((p) => /balloon/i.test(p.searchQuery));
      const bannedQ = recs.filter((p) => BANNED_QUERY.test(p.searchQuery));
      console.log(
        balloonQ.length <= 1
          ? `✓  balloon queries ${balloonQ.length}/${recs.length} (cap 1)`
          : `✗  BALLOON QUERY CAP EXCEEDED — ${balloonQ.length}/${recs.length}`
      );
      console.log(
        bannedQ.length
          ? `✗  BULK-PACK QUERIES: ${bannedQ.map((p) => `"${p.searchQuery}"`).join(", ")}`
          : `✓  no bulk-pack queries (arch kit / garland kit / NN pcs)`
      );
    }

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
      console.log(`\nresolving to real Amazon products (locale ${locale})…`);
      for (const s of suggested) {
        const cands = await searchProducts(s.label, 5, locale);
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
