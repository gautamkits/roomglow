// Server-side render of the simple before/after reveal (simpleRevealVideo.ts).
//
// The admin "Export reveal MP4" button encodes in the browser with WebCodecs,
// which headless automation browsers (e.g. Muse) don't ship with H.264. This
// draws the exact same frames with @napi-rs/canvas, pipes them through ffmpeg,
// appends the brand outro, and caches the MP4 in Blob so each design renders
// once. The browser export is untouched.

import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";
import { head, put } from "@vercel/blob";
import {
  W,
  H,
  FPS,
  TOTAL,
  containRect,
  renderSimpleRevealFrame,
  simpleRevealFrameState,
  type OfferCaption,
} from "@/lib/simpleRevealVideo";
import { designTitle, designDescription, designItems } from "@/lib/admin";
import { designTotal } from "@/lib/price";
import { SITE_URL } from "@/lib/site";
import type { ProductResult } from "@/lib/types";

/** Bump when the rendered output changes so cached reels are re-made. */
const RENDER_VERSION = "v1";
const OUTRO_FILE = path.join(process.cwd(), "public/outro/noosho-outro.mp4");
const OUTRO_CROSSFADE_S = 0.3; // matches OUTRO_CROSSFADE_FRAMES in outroClip.ts
const DEFAULT_CTA = "Comment HI for the shopping list";

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "assets/fonts");
  GlobalFonts.registerFromPath(path.join(dir, "Sora.ttf"), "Sora");
  // Serverless images have no system fonts, so the frame code's
  // "system-ui, sans-serif" fallbacks (₹, ‹ ›) need a real face behind them.
  GlobalFonts.registerFromPath(path.join(dir, "NotoSans.ttf"), "system-ui");
  GlobalFonts.registerFromPath(path.join(dir, "NotoSans.ttf"), "sans-serif");
  fontsReady = true;
}

type DesignRow = Record<string, unknown> & { id: string };

function parseJsonish<T>(v: unknown): T | null {
  if (!v) return null;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

/** Same defaults the admin export starts with. */
export function reelOffer(design: DesignRow): OfferCaption {
  const basket = designTotal(parseJsonish<ProductResult[]>(design.products) || []);
  return {
    priceLine: basket
      ? `Buy everything ${basket.partial ? "from " : "for "}${basket.formatted}`
      : "",
    ctaLine: DEFAULT_CTA,
  };
}

/** Same Instagram caption the admin export's "Copy caption" produces. */
export function reelCaption(design: DesignRow): string {
  const tags = designItems(design as never)
    .slice(0, 4)
    .map((t) => "#" + t.toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter((t) => t.length > 1);
  return `${designTitle(design as never)}\n\n${designDescription(design as never)}\n\n${DEFAULT_CTA}\n\n✨ See it & shop the look: ${SITE_URL}/design/${design.id}\n\n${[
    "#noosho",
    "#interiordesign",
    "#homedecor",
    ...tags,
  ].join(" ")}`;
}

async function imageBytes(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function run(args: string[], stdinFeed?: (stdin: NodeJS.WritableStream) => Promise<void>) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args, { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    proc.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err}`))
    );
    if (stdinFeed) {
      stdinFeed(proc.stdin).then(() => proc.stdin.end(), (e) => {
        proc.kill();
        reject(e);
      });
    } else {
      proc.stdin.end();
    }
  });
}

async function renderReel(design: DesignRow): Promise<Buffer> {
  ensureFonts();
  const beforeUrl = design.original_image_url as string | undefined;
  const afterUrl = design.generated_image_url as string | undefined;
  if (!beforeUrl || !afterUrl) throw new Error("Design is missing its before/after image.");

  const [before, after] = await Promise.all([
    imageBytes(beforeUrl).then((b) => loadImage(b)),
    imageBytes(afterUrl).then((b) => loadImage(b)),
  ]);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const rect = containRect(after.width, after.height, W, H);
  const offer = reelOffer(design);

  const dir = await mkdtemp(path.join(tmpdir(), "reel-"));
  try {
    const main = path.join(dir, "main.mp4");
    const out = path.join(dir, "out.mp4");

    await run(
      [
        "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(FPS),
        "-i", "pipe:0",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        main,
      ],
      async (stdin) => {
        for (let i = 0; i < TOTAL; i++) {
          const { revealX, offerAlpha } = simpleRevealFrameState(i);
          renderSimpleRevealFrame(
            ctx,
            before as unknown as CanvasImageSource,
            after as unknown as CanvasImageSource,
            rect,
            revealX,
            offer,
            offerAlpha
          );
          const px = canvas.data();
          if (!stdin.write(px)) await new Promise((r) => stdin.once("drain", r));
        }
      }
    );

    // Append the brand outro with the same 0.3s crossfade as the browser export
    // (which is video-only too).
    const mainDur = TOTAL / FPS;
    await run([
      "-y", "-i", main, "-i", OUTRO_FILE,
      "-filter_complex",
      `[0:v]fps=${FPS},format=yuv420p,setsar=1[a];` +
        `[1:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p,setsar=1[b];` +
        `[a][b]xfade=transition=fade:duration=${OUTRO_CROSSFADE_S}:offset=${(mainDur - OUTRO_CROSSFADE_S).toFixed(3)}[v]`,
      "-map", "[v]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      out,
    ]);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function blobKey(designId: string) {
  return `reels/${designId}-${RENDER_VERSION}.mp4`;
}

/** Public URL of the design's reel MP4, rendering + caching it on first use. */
export async function getOrRenderReel(design: DesignRow, refresh = false): Promise<string> {
  const key = blobKey(design.id);
  if (!refresh) {
    try {
      const existing = await head(key);
      if (existing?.url) return existing.url;
    } catch {
      /* not cached yet */
    }
  }
  const mp4 = await renderReel(design);
  const blob = await put(key, mp4, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

/** For local debugging: write a render to disk without touching Blob. */
export async function renderReelToFile(design: DesignRow, file: string) {
  await writeFile(file, await renderReel(design));
}
