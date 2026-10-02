/**
 * Noosho's Gandhi Jayanti greeting: records her voice, renders the reel, muxes.
 *
 * Voice: the finalised Noosho voice (Gemini TTS `Laomedeia`, Indian English,
 * docs/NOOSHO_CHARACTER.md §2) recorded as ONE take, then cut at its pauses,
 * tightened and sped up exactly like the "Noosho explains" reel
 * (src/lib/promo/explainVoice.ts), so she sounds the same.
 *
 * Video: src/lib/greetings/gandhiJayanti.ts, drawn by headless Chromium on the
 * dev-only page /dev/greeting (this script starts `next dev` itself), lip-synced
 * to the take's loudness, then encoded with ffmpeg — headless Chromium has no
 * H.264 encoder, so frames come out as PNGs.
 *
 * Usage:
 *   npx tsx scripts/greeting-video.ts            # voice + video → out/greetings/
 *   npx tsx scripts/greeting-video.ts --silent   # no voice (estimated timing), for layout checks
 *   npx tsx scripts/greeting-video.ts --reuse    # re-render with the last recorded take
 *
 * Needs GOOGLE_AI_API_KEY (env or .env.local) unless --silent/--reuse, and the
 * `playwright` package (`npm i --no-save playwright` if it's missing).
 */
import { spawn, type ChildProcess } from "child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import path from "path";
import dotenv from "dotenv";
import ffmpegPath from "ffmpeg-static";
import { GoogleGenAI } from "@google/genai";
import { RATE, TEMPO, spoken, tts, splitTake, tighten, speedUp, wav } from "../src/lib/promo/explainVoice";
import { GANDHI_LINES, GANDHI_DIRECTION, estimateTimeline, type GreetingTimeline } from "../src/lib/greetings/gandhiJayantiScript";

dotenv.config({ path: ".env.local" });

const args = new Set(process.argv.slice(2));
const SILENT = args.has("--silent");
const REUSE = args.has("--reuse");
const VOICE = "Laomedeia";
const PORT = 3199;
const OUT = path.join(process.cwd(), "out/greetings");
const FRAMES = path.join(OUT, "frames");
const TAKE = path.join(OUT, "gandhi-jayanti-voice.wav");
const TAKE_TL = path.join(OUT, "gandhi-jayanti-voice.json");
const MP4 = path.join(OUT, SILENT ? "noosho-gandhi-jayanti-silent.mp4" : "noosho-gandhi-jayanti.mp4");

/** Loudness per 30fps frame, normalised 0–1 — same as promo.loadVoiceEnvelope. */
function envelope(pcm: Buffer): number[] {
  const per = Math.round(RATE / 30);
  const n = Math.ceil(pcm.length / 2 / per);
  const env: number[] = [];
  let max = 0;
  for (let f = 0; f < n; f++) {
    let e = 0, c = 0;
    for (let i = f * per; i < Math.min(pcm.length / 2, (f + 1) * per); i++, c++) e += pcm.readInt16LE(i * 2) ** 2;
    env.push(c ? Math.sqrt(e / c) : 0);
    max = Math.max(max, env[f]);
  }
  return env.map((v) => (max ? v / max : 0));
}

async function recordVoice(): Promise<{ pcm: Buffer; tl: GreetingTimeline }> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY missing — set it in the environment or .env.local (or use --silent).");
  const ai = new GoogleGenAI({ apiKey: key });
  const script = GANDHI_LINES.map(spoken).join("\n\n");
  for (let take = 1; take <= 3; take++) {
    console.log(`Recording Noosho (take ${take})…`);
    const raw = await tts(ai, script, VOICE, GANDHI_DIRECTION);
    const segs = splitTake(raw, GANDHI_LINES.length, GANDHI_LINES.map((l) => spoken(l).length));
    if (!segs) continue;
    let { pcm, segments } = tighten(raw, segs);
    pcm = await speedUp(pcm, TEMPO);
    segments = segments.map(([s, e]) => [+(s / TEMPO).toFixed(3), +(e / TEMPO).toFixed(3)] as [number, number]);
    const duration = +(pcm.length / 2 / RATE + 1.6).toFixed(3); // hold the outro after her last word
    return { pcm, tl: { segs: segments, duration } };
  }
  throw new Error("Couldn't find the line breaks in Noosho's take after 3 tries — run again.");
}

function run(bin: string, argv: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(bin, argv, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err = (err + d).slice(-3000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(bin)} exited ${code}: ${err}`))));
  });
}

async function waitFor(url: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Dev server didn't come up at ${url}`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  let pcm: Buffer | null = null;
  let tl: GreetingTimeline;
  if (SILENT) {
    tl = estimateTimeline();
  } else if (REUSE) {
    if (!existsSync(TAKE) || !existsSync(TAKE_TL)) throw new Error("No saved take — run without --reuse first.");
    pcm = readFileSync(TAKE).subarray(44);
    tl = JSON.parse(readFileSync(TAKE_TL, "utf8"));
  } else {
    ({ pcm, tl } = await recordVoice());
    writeFileSync(TAKE, wav(pcm));
    writeFileSync(TAKE_TL, JSON.stringify(tl));
    console.log(`Voice: ${(pcm.length / 2 / RATE).toFixed(1)}s →`, path.relative(process.cwd(), TAKE));
  }
  tl.segs.forEach(([s, e], i) => console.log(`  ${s.toFixed(2)}–${e.toFixed(2)}s  ${GANDHI_LINES[i]}`));

  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    throw new Error("playwright isn't installed — run `npm i --no-save playwright`.");
  }

  console.log("Starting the dev server…");
  const dev: ChildProcess = spawn("npx", ["next", "dev", "-p", String(PORT)], { stdio: "ignore", detached: true });
  try {
    await waitFor(`http://localhost:${PORT}/dev/greeting`, 180_000);
    const exe = ["/opt/pw-browsers/chromium"].find(existsSync);
    const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
    try {
      const page = await browser.newPage();
      page.on("pageerror", (e) => console.error("page:", e.message));
      await page.goto(`http://localhost:${PORT}/dev/greeting`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__ready, null, { timeout: 120_000 });
      const n = await page.evaluate(
        ([t, env]) => window.__setVoice!(t, env),
        [tl, pcm ? envelope(pcm) : null] as const
      );
      rmSync(FRAMES, { recursive: true, force: true });
      mkdirSync(FRAMES, { recursive: true });
      for (let i = 0; i < n; i++) {
        const url = await page.evaluate((t) => window.__frame!(t), i / 30);
        writeFileSync(path.join(FRAMES, `f${String(i).padStart(4, "0")}.png`), Buffer.from(url.split(",")[1], "base64"));
        if (i % 60 === 0) process.stdout.write(`\rFrames ${i}/${n}`);
      }
      console.log(`\rFrames ${n}/${n}`);
    } finally {
      await browser.close();
    }
  } finally {
    try {
      process.kill(-dev.pid!);
    } catch {
      /* already gone */
    }
  }

  console.log("Encoding…");
  const audio = pcm
    ? ["-i", TAKE]
    : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];
  await run(ffmpegPath as unknown as string, [
    "-y", "-framerate", "30", "-i", path.join(FRAMES, "f%04d.png"), ...audio,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high",
    // AAC at 48 kHz: phone galleries and Instagram play Opus / 24 kHz tracks as silence
    "-c:a", "aac", "-ar", "48000", "-b:a", "160k", "-af", "apad",
    "-t", String(tl.duration),
    "-movflags", "+faststart", MP4,
  ]);
  rmSync(FRAMES, { recursive: true, force: true });
  console.log("Done →", path.relative(process.cwd(), MP4));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
