/**
 * Regenerates EVENT-PROMPTS.md with the EXACT prompt text sent to Gemini.
 *
 * Prompts here are template literals assembled at call time from a dozen
 * conditionals, so any hand-written copy is wrong the day it is written. This
 * stubs `globalThis.fetch`, runs the real exported pipeline functions, and
 * captures the actual request body on the wire. What lands in the document is
 * therefore what the model really receives, by construction.
 *
 *   npm run docs:events
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { EVENTS, buildEventContext } from "../src/lib/events";
import type { RoomAnalysis } from "../src/lib/types";

// ── capture rig ───────────────────────────────────────────────────────────
type Capture = { model: string; texts: string[]; images: number };
const captures: Capture[] = [];
const realFetch = globalThis.fetch;
let pngB64 = "";

const CANNED = JSON.stringify({
  candidates: [
    {
      content: {
        role: "model",
        parts: [
          { text: '{"detections":[],"selections":[],"designNarrative":"","products":[],"designVision":""}' },
          { inlineData: { mimeType: "image/png", data: "" } },
        ],
      },
      finishReason: "STOP",
    },
  ],
});

function installStub() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    if (url.includes("googleapis.com")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const parts = body?.contents?.flatMap((c: { parts?: unknown[] }) => c.parts ?? []) ?? [];
      captures.push({
        model: (url.match(/models\/([^:]+):/) ?? [])[1] ?? "?",
        texts: parts.filter((p: { text?: string }) => typeof p.text === "string").map((p: { text: string }) => p.text),
        images: parts.filter((p: { inlineData?: unknown }) => p.inlineData).length,
      });
      const res = JSON.parse(CANNED);
      res.candidates[0].content.parts[1].inlineData.data = pngB64;
      return new Response(JSON.stringify(res), { status: 200, headers: { "content-type": "application/json" } });
    }

    // Product reference images fetched inside generateDesignImage.
    return new Response(Buffer.from(pngB64, "base64"), { status: 200, headers: { "content-type": "image/png" } });
  }) as typeof fetch;
}

async function capture(label: string, fn: () => Promise<unknown>): Promise<Capture[]> {
  const start = captures.length;
  try {
    await fn();
  } catch (e) {
    if (captures.length === start) throw new Error(`${label}: no call captured — ${(e as Error).message}`);
  }
  return captures.slice(start);
}

// ── representative inputs ─────────────────────────────────────────────────
const indoorAnalysis: RoomAnalysis = {
  roomType: "living room",
  currentStyle: "modern Indian family home",
  dimensions: "medium",
  geometry: { approxWidthFt: 11, approxDepthFt: 10, approxCeilingFt: 8.5, scaleReferences: ["television stand (~5.5 ft wide)"] },
  existingFurniture: ["television", "television stand", "wooden bed frame"],
  lightingCondition: "moderate",
  colorPalette: ["#e8ded2", "#8a6b4f", "#3b3b3b"],
  suggestedProducts: [],
  clutterLevel: "cluttered",
  removableObjects: [],
  venueKind: "indoor",
  stagingPlan: {
    focalZone: "the wall behind the television console",
    focalReason: "It is the largest unobstructed wall a guest entering the room faces.",
    supportingZones: ["the television console top"],
  },
  questions: [],
};

const outdoorAnalysis: RoomAnalysis = {
  ...indoorAnalysis,
  roomType: "school ground",
  dimensions: "large",
  clutterLevel: "clean",
  venueKind: "outdoor",
  stagingPlan: undefined,
};

const products = [
  { category: "balloon arch kit", placement: "focal zone — centred on the wall behind the TV console", title: "Pastel Balloon Arch Garland Kit", colorSuggestion: "pastel pink and mint", imageUrl: "https://m.media-amazon.com/images/I/example.jpg" },
];

const candidates = [
  {
    category: "balloon arch kit",
    placement: "focal zone — centred on the wall behind the TV console",
    reason: "Anchors the focal wall.",
    colorSuggestion: "pastel pink and mint",
    candidates: [
      { title: "Pastel Balloon Arch Garland Kit", price: "₹259", imageUrl: "https://m.media-amazon.com/images/I/a.jpg", affiliateUrl: "https://www.amazon.in/dp/B09RSY4RDR?tag=yuaid-21", rating: 4.2, asin: "B09RSY4RDR" },
    ],
  },
];

// ── run ───────────────────────────────────────────────────────────────────
async function main() {
  pngB64 = (await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 180, b: 160 } } }).png().toBuffer()).toString("base64");
  installStub();

  const g = await import("../src/lib/gemini");
  const brief = buildEventContext({ eventType: "birthday", eventLabel: "Birthday", subTheme: "Floral", colorScheme: "Pastel" })!;

  const analyzeEvent = await capture("analyzeRoom(event)", () => g.analyzeRoom(pngB64, brief));
  const analyzeSpace = await capture("analyzeRoom(space)", () => g.analyzeRoom(pngB64));
  const recIndoor = await capture("recommendProducts(indoor)", () => g.recommendProducts(indoorAnalysis, {}, ["Balloon arch kit"], brief, [], "IN"));
  const recOutdoor = await capture("recommendProducts(outdoor)", () => g.recommendProducts(outdoorAnalysis, {}, ["Balloon arch kit"], brief, [], "IN"));
  const curate = await capture("curateProducts", () => g.curateProducts(pngB64, "A pastel floral birthday.", candidates, "BUDGET CONSTRAINT: Keep the COMBINED total under ₹3000."));
  const render = await capture("generateDesignImage", () => g.generateDesignImage(pngB64, products, brief, undefined, true, indoorAnalysis.geometry, false));
  const empty = await capture("emptyRoom", () => g.emptyRoom(pngB64, ["Bean bag", "Child's ride-on toy"], ["Television"], []));
  const edit = await capture("editDesignImage", () => g.editDesignImage(pngB64, "Put the Indian flag back on the flagpole."));

  const out: string[] = [];
  const p = (s = "") => out.push(s);
  const block = (caps: Capture[], note?: string) => {
    for (const c of caps) {
      p(`*Model: \`${c.model}\` · ${c.images} image${c.images === 1 ? "" : "s"} attached*`);
      p();
      if (note) { p(note); p(); }
      for (const t of c.texts) { p("```text"); p(t); p("```"); p(); }
    }
  };

  p("# Event prompts — exact text sent to Gemini");
  p();
  p("**Generated file — do not edit by hand.** Run `npm run docs:events`.");
  p();
  p("Captured by stubbing `fetch` and running the real pipeline functions, so this is the literal request body, not a transcription.");
  p();
  p("Interpolated values below come from one representative case: a **Birthday / Floral / Pastel** event in an 11×10ft cluttered living room. Only the *event brief* changes per event — see Part 2.");
  p();
  p("---");
  p();
  p("## Part 1 — the pipeline");
  p();
  p("| Step | Function | Model | Prompt below |");
  p("| --- | --- | --- | --- |");
  p("| 1 | `analyzeRoom` | `gemini-2.5-flash` | [§1.1 event](#11-analyzeroom--event) / [§1.2 space](#12-analyzeroom--space) |");
  p("| 2 | `recommendProducts` | `gemini-2.5-flash` | [§2.1 indoor](#21-recommendproducts--indoor-event) / [§2.2 outdoor](#22-recommendproducts--outdoor-event) |");
  p("| 3 | `curateProducts` | `gemini-2.5-flash` | [§3](#3-curateproducts) |");
  p("| 4 | `generateDesignImage` | `gemini-3.1-flash-image` | [§4](#4-generatedesignimage) |");
  p("| 4b | `detectHotspots` | `gemini-2.5-flash` | [§5](#5-detecthotspots) |");
  p("| — | `emptyRoom` (tidy-up pre-pass) | `gemini-3.1-flash-image` | [§6](#6-emptyroom) |");
  p("| — | `editDesignImage` (admin) | `gemini-3.1-flash-image` | [§7](#7-editdesignimage) |");
  p();
  p("Three behaviours are deliberately distinct: **space** redesigns, **indoor** events (focal staging), and **outdoor** events (pre-staging logic). `analyzeRoom` picks `venueKind`, and `enforceVenueBranch` strips `stagingPlan` for outdoor so every later step reverts on its own.");
  p();
  p("---");
  p();
  p("## Part 2 — the event brief");
  p();
  p("Built by `buildEventContext()` (`src/lib/events.ts`) and threaded into steps 1, 2 and 4. **This is the only text that differs per event.**");
  p();
  p("```text");
  p('This space will host a {promptLabel} with a "{subTheme}" theme using a {colorScheme} color scheme.{gender}{honoree} All signage and décor must match a {promptLabel} — never a different occasion, and never another country\'s version of the same-named holiday.');
  p("```");
  p();
  p(`### All ${EVENTS.length} events`);
  p();
  p("| Event | id | Markets | Sent to model as | Themes | Colours |");
  p("| --- | --- | --- | --- | --- | --- |");
  for (const e of EVENTS) {
    p(`| ${e.icon} ${e.label} | \`${e.id}\` | ${e.markets.join(", ")} | ${e.promptLabel ?? e.label} | ${e.subThemes.join(", ")} | ${e.colorSchemes.join(", ")} |`);
  }
  p();
  p("`promptLabel` overrides the user-facing label where it is ambiguous across markets — \"Independence Day\" means different things in IN and US, and it lands verbatim in the Amazon search query.");
  p();
  p("---");
  p();
  p("## Part 3 — exact prompts");
  p();
  p("### 1.1 analyzeRoom — event");
  p();
  block(analyzeEvent);
  p("### 1.2 analyzeRoom — space");
  p();
  p("For contrast. Space is a separate branch and must not be changed without an explicit request (see CLAUDE.md).");
  p();
  block(analyzeSpace);
  p("### 2.1 recommendProducts — indoor event");
  p();
  block(recIndoor);
  p("### 2.2 recommendProducts — outdoor event");
  p();
  p("Same function, no `stagingPlan`. Note the stylist rules and placement instruction both change.");
  p();
  block(recOutdoor);
  p("### 3 curateProducts");
  p();
  block(curate);
  p("### 4 generateDesignImage");
  p();
  block(render.slice(0, 1));
  p("### 5 detectHotspots");
  p();
  p("Second call inside `generateDesignImage` when `detect` is true.");
  p();
  block(render.slice(1));
  p("### 6 emptyRoom");
  p();
  p("Tidy-up pre-pass, run before the design when the user clears anything.");
  p();
  block(empty);
  p("### 7 editDesignImage");
  p();
  p("Admin touch-up of a finished render. Never re-fetches Amazon products.");
  p();
  block(edit);

  globalThis.fetch = realFetch;
  writeFileSync("EVENT-PROMPTS.md", out.join("\n"));
  console.log(`Wrote EVENT-PROMPTS.md — ${EVENTS.length} events, ${captures.length} prompts captured`);
}

main();
