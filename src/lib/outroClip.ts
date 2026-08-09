// Shared brand outro clip appended to both reveal exports.
//
// `public/outro/noosho-outro.mp4` is a pre-rendered 1080×1920 / 30fps H.264
// outro that carries its own call to action. Rather than re-authoring it in
// Canvas2D, we decode it frame-by-frame and re-encode it onto the tail of the
// export, so it lands in the same MP4 as the generated scenes.
//
// Decoding is done with a plain <video> + seek (not WebCodecs + a demuxer) —
// the clip is 87 frames, and seeking is deterministic where playback would drop
// frames under encoder backpressure. Frames are pulled one at a time and drawn
// straight onto the export canvas: buffering all 87 as bitmaps would cost
// ~700MB at this resolution.

export const OUTRO_URL = "/outro/noosho-outro.mp4";
const OUTRO_FPS = 30;

/** Frames of the main timeline that the outro fades in over. */
export const OUTRO_CROSSFADE_FRAMES = 9; // 0.3s at 30fps

export interface OutroClip {
  /** Number of whole frames the clip contributes at the export frame rate. */
  frameCount: number;
  /** Seeks to frame `index` and paints it, cover-fit, into `w`×`h`. */
  drawFrame(ctx: CanvasRenderingContext2D, index: number, w: number, h: number): Promise<void>;
  dispose(): void;
}

function once(el: HTMLVideoElement, ok: string, fail = "error"): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      el.removeEventListener(ok, onOk);
      el.removeEventListener(fail, onFail);
    };
    const onOk = () => { cleanup(); resolve(); };
    const onFail = () => { cleanup(); reject(new Error(`Outro clip failed on "${fail}".`)); };
    el.addEventListener(ok, onOk);
    el.addEventListener(fail, onFail);
  });
}

/**
 * Loads the outro clip, ready for frame-by-frame drawing.
 * Returns `null` if it can't be loaded or decoded — the export must still
 * succeed without it, since the clip is a nice-to-have tail, not the content.
 */
export async function loadOutroClip(
  url: string = OUTRO_URL,
  fps: number = OUTRO_FPS
): Promise<OutroClip | null> {
  if (typeof document === "undefined") return null;

  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  // Same-origin (served from /public), so the canvas is never tainted — but be
  // explicit in case the clip is ever moved to Blob storage.
  video.crossOrigin = "anonymous";

  try {
    await once(video, "loadeddata");
    if (!video.videoWidth || !Number.isFinite(video.duration) || video.duration <= 0) {
      return null;
    }

    const frameCount = Math.max(1, Math.round(video.duration * fps));

    return {
      frameCount,
      async drawFrame(ctx, index, w, h) {
        // Seek to the middle of the frame's interval so rounding never lands us
        // on a boundary and returns the neighbouring frame.
        const t = Math.min((index + 0.5) / fps, Math.max(0, video.duration - 1e-3));
        if (Math.abs(video.currentTime - t) > 1e-4) {
          const seeked = once(video, "seeked");
          video.currentTime = t;
          await seeked;
        }
        const r = Math.max(w / video.videoWidth, h / video.videoHeight);
        const dw = video.videoWidth * r;
        const dh = video.videoHeight * r;
        ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
      },
      dispose() {
        video.removeAttribute("src");
        video.load();
      },
    };
  } catch {
    video.removeAttribute("src");
    return null;
  }
}

export interface AppendOutroOptions {
  encoder: VideoEncoder;
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  clip: OutroClip;
  /** Frame index the main timeline ended on — outro frames continue from here. */
  startIndex: number;
  fps: number;
  /** Called once per encoded outro frame with the absolute frame index. */
  onFrame?: (absoluteIndex: number) => void;
}

/**
 * Encodes the outro onto the end of an in-flight export, crossfading from
 * whatever the canvas currently holds (the last main frame).
 */
export async function appendOutro({
  encoder,
  ctx,
  canvas,
  clip,
  startIndex,
  fps,
  onFrame,
}: AppendOutroOptions): Promise<void> {
  const { width: W, height: H } = canvas;
  const frameDur = 1_000_000 / fps;

  // Snapshot the last main frame so the crossfade has something to fade out.
  const tail = document.createElement("canvas");
  tail.width = W;
  tail.height = H;
  tail.getContext("2d")?.drawImage(canvas, 0, 0);

  const fade = Math.min(OUTRO_CROSSFADE_FRAMES, clip.frameCount);

  for (let i = 0; i < clip.frameCount; i++) {
    ctx.globalAlpha = 1;
    ctx.drawImage(tail, 0, 0);
    if (i < fade) {
      // Ease the outro in over the held last frame.
      ctx.globalAlpha = (i + 1) / (fade + 1);
    }
    await clip.drawFrame(ctx, i, W, H);
    ctx.globalAlpha = 1;

    const abs = startIndex + i;
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(abs * frameDur),
      duration: Math.round(frameDur),
    });
    encoder.encode(frame, { keyFrame: i === 0 || abs % fps === 0 });
    frame.close();

    onFrame?.(abs);

    if (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
