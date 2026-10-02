import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { del, head, put } from "@vercel/blob";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign } from "@/lib/db";
import { ensureHotspots } from "@/lib/hotspots";
import { designTotal } from "@/lib/price";
import type { ProductResult } from "@/lib/types";
import { recordLines, recordVoice, wav } from "@/lib/promo/explainVoice";
import { GANDHI_LINES, GANDHI_DIRECTION } from "@/lib/greetings/gandhiJayantiScript";
import { writeExplainLines, type ScriptPhoto } from "@/lib/promo/explainScript";

export const runtime = "nodejs";
export const maxDuration = 120;

// Admin: the "Noosho explains" reel ("blank canvas" script, picked 2026-09-27).
//   script — five lines for one design: 1–3 written by Gemini from its photos,
//            4–5 fixed; plus the products/prices the video pins (prices come
//            from the design only, never the model).
//   voice  — one Gemini TTS take, cut into lines at its pauses, tightened, sped
//            up 15%, with synthesised sound effects mixed in. Cached in Blob.
//   mux    — phones: adds that voice to a silent render as AAC.
//   greeting — Noosho's Gandhi Jayanti greeting (/admin/greeting): the same
//            voice and processing, no sound effects, no design. Cached in Blob.

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
const blobToken = process.env.newblob_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

const VOICES = ["Laomedeia", "Leda"] as const;

function parseJsonish<T>(raw: unknown): T | null {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return (raw as T) ?? null;
}

type Prod = { amazonProduct?: { title?: string; price?: string; imageUrl?: string } | null };

/** "$129.56" → "$130", "₹4,499.00" → "₹4,499": whole numbers read cleanly aloud. */
function roundPrice(price: string): string {
  return price.replace(/([\d,]+)\.(\d+)/, (_, whole: string, frac: string) => {
    const n = Math.ceil(parseFloat(`${whole.replace(/,/g, "")}.${frac}`));
    return n.toLocaleString(/₹|Rs|INR/i.test(price) ? "en-IN" : "en-US");
  });
}

async function buildScript(designId: string, avoid: string[] = []) {
  // Hotspots let the video pin each price onto the design itself.
  try {
    await ensureHotspots(designId);
  } catch {
    /* prices fall back to tags along the bottom */
  }
  const design = await getDesign(designId);
  if (!design) throw new Error("Design not found");
  const ra = parseJsonish<Record<string, unknown>>(design.room_analysis) ?? {};
  const ec = parseJsonish<Record<string, unknown>>(design.event_config) ?? {};
  const hot = new Map(
    (parseJsonish<{ productIndex: number; x: number; y: number }[]>(design.hotspots) ?? []).map((h) => [h.productIndex, h])
  );
  const withSpot = (parseJsonish<Prod[]>(design.products) ?? [])
    .map((p, i) => ({ ...p.amazonProduct, spot: hot.get(i) }))
    .filter((p) => !!p.imageUrl && !!p.price);
  // Prefer products we can point at, then the priciest (the video shows 2–3).
  const amt = (p: { price?: string }) => Number((p.price || "").replace(/[^\d.]/g, "")) || 0;
  withSpot.sort((a, b) => (b.spot ? 1 : 0) - (a.spot ? 1 : 0) || amt(b) - amt(a));
  const products = withSpot.slice(0, 6);

  // Lines 1–3 are written from the photos themselves; 4–5 are fixed.
  const photo = async (url: unknown): Promise<ScriptPhoto> => {
    const r = await fetch(String(url));
    if (!r.ok) throw new Error(`Photo fetch failed (${r.status})`);
    return {
      mimeType: r.headers.get("content-type")?.split(";")[0] || "image/jpeg",
      data: Buffer.from(await r.arrayBuffer()).toString("base64"),
    };
  };
  const [before, after] = await Promise.all([photo(design.original_image_url), photo(design.generated_image_url)]);
  const lines = await writeExplainLines(ai, {
    before,
    after,
    mode: design.mode,
    roomType: ra.roomType as string | undefined,
    eventLabel: ec.eventLabel as string | undefined,
    subTheme: ec.subTheme as string | undefined,
    narrative: design.design_narrative,
    productNames: products.map((p) => p.title || "").filter(Boolean),
    avoid,
  });

  // The total shows on screen (badge), not in her line — the long number made
  // the reel drag. "from" when some products have no price.
  const basket = designTotal(parseJsonish<ProductResult[]>(design.products) ?? []);
  const price = basket ? roundPrice(basket.formatted) : null;
  const lead = basket?.partial ? "from" : "for";
  return {
    lines,
    total: price ? `Buy everything ${lead} ${price}` : null,
    products: products.map((p) => ({
      title: p.title || "Featured product",
      price: roundPrice(p.price!),
      imageUrl: p.imageUrl!,
      x: p.spot?.x,
      y: p.spot?.y,
    })),
  };
}

async function buildVoice(designId: string, lines: string[], voice: string, fx: { prices: number; total: boolean }) {
  const hash = createHash("sha1").update(JSON.stringify({ v: 6, lines, voice, fx })).digest("hex").slice(0, 12);
  return cachedVoice(`${designId}-${hash}`, () => recordVoice(ai, lines, voice, fx));
}

/** A take stored as promo-vo/<id>.wav + .json, recorded once per id. */
async function cachedVoice(id: string, record: () => Promise<{ pcm: Buffer; segments: [number, number][] }>) {
  const key = `promo-vo/${id}.json`;
  try {
    const existing = await head(key, { token: blobToken });
    if (existing?.url) return { ...(await fetch(existing.url).then((r) => r.json())), cached: true };
  } catch {
    /* not cached yet */
  }

  const { pcm, segments } = await record();
  const audio = await put(`promo-vo/${id}.wav`, wav(pcm), {
    access: "public",
    contentType: "audio/wav",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken,
  });
  const meta = { url: audio.url, segments };
  await put(key, JSON.stringify(meta), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: blobToken,
  });
  return { ...meta, cached: false };
}

function ffmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`))));
  });
}

const BLOB_HOST = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;

/** Phones can't encode AAC in the browser, so they upload a silent render and
 *  we add the voice here: video copied as-is, audio encoded to AAC. */
async function mux(designId: string, videoUrl: string, audioUrl: string) {
  if (!BLOB_HOST.test(videoUrl) || !BLOB_HOST.test(audioUrl)) throw new Error("Bad media URL");
  const dir = await mkdtemp(path.join(tmpdir(), "noosho-mux-"));
  try {
    const [v, a] = await Promise.all(
      [videoUrl, audioUrl].map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`Download failed (${r.status})`);
        return Buffer.from(await r.arrayBuffer());
      })
    );
    const vin = path.join(dir, "in.mp4"), ain = path.join(dir, "voice.wav"), out = path.join(dir, "out.mp4");
    await Promise.all([writeFile(vin, v), writeFile(ain, a)]);
    await ffmpeg([
      "-y", "-i", vin, "-i", ain,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
      "-movflags", "+faststart", out,
    ]);
    const blob = await put(`promo-out/${designId}-${Date.now()}.mp4`, await readFile(out), {
      access: "public",
      contentType: "video/mp4",
      addRandomSuffix: true,
      token: blobToken,
    });
    await del(videoUrl, { token: blobToken }).catch(() => {});
    return { url: blob.url };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    if (body.action === "greeting") {
      const voice = VOICES.includes(body.voice) ? body.voice : VOICES[0];
      // Lines and direction are fixed server-side; `take` > 0 re-records.
      const take = Math.max(0, Math.min(20, Number(body.take) || 0));
      const hash = createHash("sha1")
        .update(JSON.stringify({ v: 1, lines: GANDHI_LINES, direction: GANDHI_DIRECTION, voice, take }))
        .digest("hex")
        .slice(0, 12);
      return NextResponse.json(
        await cachedVoice(`greeting-gandhi-jayanti-${hash}`, () =>
          recordLines(ai, GANDHI_LINES, voice, { direction: GANDHI_DIRECTION })
        )
      );
    }
    const designId = String(body.designId || "");
    if (!designId) return NextResponse.json({ error: "Missing designId" }, { status: 400 });

    if (body.action === "script") {
      const avoid = (Array.isArray(body.avoid) ? body.avoid : []).map((l: unknown) => String(l)).slice(0, 12);
      return NextResponse.json(await buildScript(designId, avoid));
    }
    if (body.action === "mux") {
      return NextResponse.json(await mux(designId, String(body.videoUrl || ""), String(body.audioUrl || "")));
    }
    if (body.action === "voice") {
      const lines = (Array.isArray(body.lines) ? body.lines : [])
        .map((l: unknown) => String(l).trim())
        .filter(Boolean)
        .slice(0, 10);
      if (!lines.length) return NextResponse.json({ error: "No lines" }, { status: 400 });
      const voice = VOICES.includes(body.voice) ? body.voice : VOICES[0];
      const fx = { prices: Math.max(0, Math.min(3, Number(body.prices) || 0)), total: !!body.total };
      return NextResponse.json(await buildVoice(designId, lines, voice, fx));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("noosho-explain failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
