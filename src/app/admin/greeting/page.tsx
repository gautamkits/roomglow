"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { Film, Download } from "lucide-react";
import { GANDHI_LINES, greetingTimeline } from "@/lib/greetings/gandhiJayantiScript";
import type { PromoAssets } from "@/lib/promo/promo";

// Admin: Noosho's Gandhi Jayanti greeting reel. The voice is recorded on the
// server (same Gemini voice + processing as "Noosho explains", cached in Blob);
// the video renders here in the browser, like the other exports.

type Voice = "Laomedeia" | "Leda";

function Greeting() {
  const { status } = useSession();
  const [voice, setVoice] = useState<Voice>("Laomedeia");
  const [take, setTake] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin/login";
  }, [status]);

  const make = async (nextTake = take) => {
    setError(null);
    setPct(0);
    try {
      if (typeof VideoEncoder === "undefined") throw new Error("This browser can't make videos — use Chrome on a computer.");
      setStage("Recording Noosho's voice…");
      const r = await fetch("/api/admin/noosho-explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "greeting", voice, take: nextTake }),
      });
      const vo = await r.json();
      if (!r.ok) throw new Error(vo.error || "Voice recording failed.");

      setStage("Getting Noosho ready…");
      const [promo, g] = await Promise.all([import("@/lib/promo/promo"), import("@/lib/greetings/gandhiJayanti")]);
      const [kit, envelope] = await Promise.all([promo.loadNooshoKit(), promo.loadVoiceEnvelope(vo.url)]);
      if (!kit) throw new Error("Couldn't draw Noosho.");
      g.tameWave(kit);
      const gtl = greetingTimeline(vo.segments);
      const blank = new Image();
      const assets: PromoAssets = { ...kit, envelope, before: blank, after: blank, cards: [], products: [], gallery: [] };
      const zero: [number, number] = [0, 0];
      const tl = {
        intro: zero, montage: zero, photo: zero, scan: zero, shop: zero, reveal: zero, pins: zero, outro: zero,
        lines: vo.segments as [number, number][],
        captions: GANDHI_LINES,
        duration: gtl.duration,
      };
      const render = (ctx: CanvasRenderingContext2D, t: number, a: PromoAssets) =>
        g.renderGandhiJayanti(ctx, a, t, gtl);
      const onProgress = (f: number) => setPct(Math.round(f * 100));
      setStage("Rendering");

      let blob: Blob;
      // Same split as the "Noosho explains" export: only desktop Chromium's AAC
      // is trustworthy in the MP4; everyone else renders silently and the
      // server adds the voice as AAC.
      const ua = navigator.userAgent;
      const desktopChromium = /Chrome\/\d+/.test(ua) && !/iPhone|iPad|iPod|Android|CriOS|FxiOS|EdgiOS/.test(ua);
      if (desktopChromium && (await promo.canEncodeAac())) {
        blob = await promo.generatePromoVideo(assets, tl, { voiceUrl: vo.url, render, onProgress });
      } else {
        const silent = await promo.generatePromoVideo(assets, tl, { voice: false, render, onProgress });
        setStage("Adding Noosho's voice…");
        const { upload } = await import("@vercel/blob/client");
        const up = await upload("promo-tmp/greeting-gandhi-jayanti.mp4", silent, {
          access: "public",
          handleUploadUrl: "/api/admin/noosho-explain/upload",
          contentType: "video/mp4",
        });
        const m = await fetch("/api/admin/noosho-explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mux", designId: "greeting-gandhi-jayanti", videoUrl: up.url, audioUrl: vo.url }),
        });
        const mx = await m.json();
        if (!m.ok) throw new Error(mx.error || "Couldn't add the voice.");
        const out = await fetch(mx.url);
        if (!out.ok) throw new Error("Couldn't download the finished video.");
        blob = await out.blob();
      }
      if (video) URL.revokeObjectURL(video);
      setVideo(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStage(null);
    }
  };

  const busy = stage !== null;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 px-4 py-8">
      <div className="max-w-md mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Gandhi Jayanti greeting</h1>
          <p className="text-sm text-zinc-500">Noosho wishes everyone, in her own voice. 9:16 · 1080×1920.</p>
        </div>

        <ol className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-1.5 list-decimal list-inside text-sm text-zinc-700 dark:text-zinc-300">
          {GANDHI_LINES.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>

        <label className="flex items-center gap-2 text-sm text-zinc-500">
          Voice
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value as Voice)}
            disabled={busy}
            className="px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          >
            <option value="Laomedeia">Laomedeia (Indian accent)</option>
            <option value="Leda">Leda</option>
          </select>
        </label>

        <div className="flex gap-2">
          <button
            onClick={() => make()}
            disabled={busy || status !== "authenticated"}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium disabled:opacity-60"
          >
            <Film size={16} />
            {stage === "Rendering" ? `Rendering… ${pct}%` : stage ?? "Make video"}
          </button>
          {video && (
            <button
              onClick={() => {
                const next = take + 1;
                setTake(next);
                make(next);
              }}
              disabled={busy}
              className="px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium disabled:opacity-60"
            >
              New take
            </button>
          )}
        </div>
        <p className="text-[11px] text-zinc-400">
          The voice is recorded once and reused; &quot;New take&quot; asks Noosho to say it again.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {video && (
          <div className="space-y-3">
            <video src={video} controls playsInline className="w-full rounded-xl bg-black aspect-[9/16]" />
            <a
              href={video}
              download="noosho-gandhi-jayanti.mp4"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-orange-700 text-orange-700 text-sm font-medium"
            >
              <Download size={16} />
              Download MP4
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GreetingPage() {
  return (
    <SessionProvider>
      <Greeting />
    </SessionProvider>
  );
}
