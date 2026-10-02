"use client";

import { useEffect, useRef } from "react";
import { loadNooshoKit } from "@/lib/promo/promo";
import { REEL_W, REEL_H } from "@/lib/revealVideo";
import {
  renderGandhiJayanti,
  estimateTimeline,
  type GreetingTimeline,
} from "@/lib/greetings/gandhiJayanti";

declare global {
  interface Window {
    __ready?: boolean;
    /** Voice timing + loudness envelope (one value per 30fps frame) for lip-sync. */
    __setVoice?: (tl: GreetingTimeline, envelope: number[] | null) => number;
    /** Draw time `t` and return the frame as a PNG data URL. */
    __frame?: (t: number) => string;
  }
}

export default function GreetingCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (async () => {
      try {
        await document.fonts.ready;
      } catch {
        /* render with fallbacks */
      }
      const kit = await loadNooshoKit();
      if (!kit?.expr) throw new Error("Couldn't draw Noosho.");
      // The 30°/40° wave frames swing past the sprite's 200×260 viewBox and
      // clip her hand; wave between −6° and 18° instead.
      for (const key of [...kit.expr.keys()]) {
        const m = key.match(/^(wave\|.*\|)(30|40)$/);
        if (m) kit.expr.set(key, kit.expr.get(`${m[1]}18`)!);
      }
      const ctx = ref.current!.getContext("2d")!;
      let tl = estimateTimeline();
      window.__setVoice = (next, envelope) => {
        tl = next;
        kit.envelope = envelope ? Float32Array.from(envelope) : undefined;
        return Math.round(tl.duration * 30);
      };
      window.__frame = (t) => {
        renderGandhiJayanti(ctx, kit, t, tl);
        return ref.current!.toDataURL("image/png");
      };
      renderGandhiJayanti(ctx, kit, 4, tl);
      window.__ready = true;
    })();
  }, []);
  return <canvas ref={ref} width={REEL_W} height={REEL_H} style={{ width: 360, height: 640 }} />;
}
