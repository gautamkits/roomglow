"use client";

import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { Check, Loader2 } from "lucide-react";
import Mascot, { type MascotPose } from "./Mascot";
import type { CatalogPreview } from "@/hooks/useRoomFlow";

interface ProcessingViewProps {
  image: string | null;
  step: "analyzing" | "generating" | "curating";
  isEvent: boolean;
  mode?: "space" | "event" | "makeover";
  statusMessage?: string;
  /** Auto-selected items shown while the design is being built. */
  items?: { label: string; icon?: string }[];
  /** Real observations from analyzeRoom — room type, palette, furniture seen. */
  findings?: string[];
  /** Real Amazon candidates, available once product search returns. */
  catalog?: CatalogPreview[];
  /** Image URLs curation actually picked, available once curation returns. */
  picked?: string[];
}

type Mode = "space" | "event" | "makeover";

/**
 * The item list, driven by the REAL pipeline phase.
 *
 * This used to advance on a 1700ms `setTimeout` regardless of what the pipeline
 * was actually doing, so on a slow run every item read as "done" while the
 * design was still being sourced, and on a fast run the list was still ticking
 * after the design was finished. Now each item's state is derived from `phase`,
 * which only moves when a pipeline step actually completes.
 */
function ItemList({
  items,
  mode,
  phase,
}: {
  items: { label: string; icon?: string }[];
  mode: Mode;
  /** 1 = planning, 2 = sourcing on Amazon, 3 = rendering. */
  phase: number;
}) {
  const sourcing = phase === 2;
  const placed = phase >= 3;

  const caption = placed
    ? mode === "event"
      ? "Staging your venue…"
      : mode === "makeover"
        ? "Dressing you in the look…"
        : "Placing them in your room…"
    : sourcing
      ? "Matching each piece to a real product…"
      : "Planning the pieces…";

  return (
    <>
      <ul className="mt-6 space-y-2" aria-live="polite">
        {items.map((item, i) => (
          <li
            key={`${item.label}-${i}`}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors ${
              sourcing
                ? "border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/20"
                : "border-transparent"
            } ${placed || sourcing ? "opacity-100" : "opacity-60"}`}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center">
              {placed ? (
                <span className="w-5 h-5 rounded-full bg-orange-700 text-white flex items-center justify-center">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : sourcing ? (
                <Loader2 size={16} className="text-orange-700 animate-spin" />
              ) : (
                <span className="text-base leading-none">{item.icon ?? "•"}</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {item.label}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-sm text-orange-700 dark:text-orange-400">{caption}</p>
    </>
  );
}

/**
 * What Noosho says, per real pipeline phase. Playful, but every line is still
 * true about what is happening at that moment — the phase only advances when a
 * pipeline step actually completes, so she never claims to be shopping while
 * the room is still being read.
 */
const LINES: Record<number, Record<Mode, string[]>> = {
  0: {
    space: [
      "ok hold on, reading the room 👀",
      "this space has main character energy fr",
      "clocking the light, the corners, the vibes ✨",
      "measuring with my eyes (very scientific) 📏",
    ],
    event: [
      "ooh a party? say less 🎉",
      "scoping out the venue rn 👀",
      "finding the spot everyone will take photos at 📸",
      "clocking the walls, the light, the vibes ✨",
    ],
    makeover: ["ok let me look at you 👀", "clocking the whole fit ✨"],
  },
  1: {
    space: [
      "brainstorming… the ideas are ideating 💭",
      "manifesting a cozy corner ✨",
      "moodboard loading… it's giving calm luxury",
      "picking a vibe. this is the fun part 🎨",
    ],
    event: [
      "planning the glow up 🎈",
      "moodboard loading… it's giving celebration",
      "deciding where the balloons go (important) 🎈",
    ],
    makeover: ["styling… this is the fun part 🎨", "it's giving main character"],
  },
  2: {
    space: [
      "raiding amazon rn, brb 🛒",
      "no bc this one?? obsessed",
      "adding to cart (emotionally) 🛍️",
      "only real stuff you can actually buy 💅",
      "matching everything, it has to go together",
    ],
    event: [
      "raiding amazon for decor rn 🛒",
      "no bc these?? obsessed 🎈",
      "only real stuff you can actually order 💅",
      "matching the colours, trust the process",
    ],
    makeover: ["raiding amazon for the fit 🛒", "no bc this?? obsessed"],
  },
  3: {
    space: [
      "placing everything juuust right 📐",
      "ok it's giving ✨ almost done",
      "final touches, don't look yet 🙈",
      "your room is about to glow up fr",
    ],
    event: [
      "setting up the decor juuust right 🎀",
      "ok it's giving party ✨ almost done",
      "final touches, don't look yet 🙈",
    ],
    makeover: ["putting the look together ✨", "final touches, don't look yet 🙈"],
  },
};

const POSE_BY_PHASE: MascotPose[] = ["peek", "idea", "carry", "celebrate"];

function SpeechBubble({ phase, mode }: { phase: number; mode: Mode }) {
  const lines = LINES[phase]?.[mode] ?? LINES[phase]?.space ?? [];
  const [i, setI] = useState(0);
  // Restart the rotation on each phase change, so the first thing she says in
  // a new phase is about that phase.
  useEffect(() => {
    setI(0);
    const t = setInterval(() => setI((n) => n + 1), 2800);
    return () => clearInterval(t);
  }, [phase, mode]);
  const line = lines.length ? lines[i % lines.length] : "";
  return (
    <div className="relative flex-1 min-w-0">
      <div
        key={`${phase}-${i}`}
        className="animate-bubble-pop relative rounded-2xl rounded-bl-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm px-4 py-3"
        aria-live="polite"
      >
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
          Noosho
        </span>
        <span className="block text-[15px] leading-snug text-zinc-900 dark:text-zinc-100">{line}</span>
      </div>
    </div>
  );
}

/**
 * Real Amazon candidates drop in like stickers while Noosho curates; once
 * curation returns, her picks get circled and the rest fade back.
 */
function Catalog({ catalog, picked }: { catalog: CatalogPreview[]; picked: string[] }) {
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const hasPicks = picked.length > 0;
  // Picks that weren't among the preview candidates still deserve a slot.
  const shown = useMemo(() => {
    const urls = new Set(catalog.map((c) => c.imageUrl));
    const extra: CatalogPreview[] = picked
      .filter((u) => !urls.has(u))
      .map((u) => ({ imageUrl: u, title: "", price: "", category: "" }));
    return [...catalog, ...extra].slice(0, 12);
  }, [catalog, picked]);

  if (!shown.length) return null;
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {hasPicks ? "Noosho’s picks ✨" : "Noosho’s catalog"}
        </span>
        <span className="text-[11px] text-zinc-400">
          {hasPicks ? `${picked.length} chosen · real & buyable` : `${catalog.length} found on Amazon`}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {shown.map((c, i) => {
          const isPick = pickedSet.has(c.imageUrl);
          const faded = hasPicks && !isPick;
          return (
            <div
              key={c.imageUrl + i}
              className="animate-sticker-drop"
              style={{ animationDelay: `${i * 0.12}s`, "--tilt": `${i % 2 ? 4 : -5}deg` } as CSSProperties}
              title={c.title}
            >
              <div
                className={`relative aspect-square rounded-xl bg-white border p-1.5 transition-all duration-500 ${
                  isPick
                    ? "border-orange-700 ring-2 ring-orange-700 shadow-md"
                    : "border-zinc-200 dark:border-zinc-700"
                } ${faded ? "opacity-25 grayscale scale-90" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.imageUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
                {isPick && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-orange-700 text-white flex items-center justify-center shadow">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProcessingView({
  image,
  step,
  isEvent,
  mode,
  statusMessage,
  items,
  findings,
  catalog = [],
  picked = [],
}: ProcessingViewProps) {
  const activeMode: Mode = mode ?? (isEvent ? "event" : "space");

  /**
   * The pipeline reuses the "generating" step for two different phases — the
   * planning pass *before* curation and the image render *after* it — so the
   * old `analyzing→0, generating→1, curating→2` mapping made the stepper
   * visibly walk backwards from "Sourcing" to "Designing" during the render,
   * which is the longest phase. Tracking the high-water mark keeps it
   * monotonic and lets the fourth stage finally light up.
   */
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    setPhase((prev) => {
      const next =
        step === "analyzing" ? 0 : step === "curating" ? 2 : prev >= 2 ? 3 : 1;
      return Math.max(prev, next);
    });
  }, [step]);

  const hasCatalog = catalog.length > 0 || picked.length > 0;
  // The item list stands in before real products exist; once the catalog has
  // real thumbnails it takes over.
  const showItems = step !== "analyzing" && !!items && items.length > 0 && !hasCatalog;

  const labels =
    activeMode === "event"
      ? ["Vibe check", "Planning", "Shopping", "Staging"]
      : activeMode === "makeover"
        ? ["Vibe check", "Styling", "Shopping", "Rendering"]
        : ["Vibe check", "Designing", "Shopping", "Glow up"];

  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-14 px-1">
      <div className="w-full max-w-md">
        {/* The user's own photo, being "read" */}
        <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-lg aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Your uploaded photo" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" />
          )}
          <div className="absolute inset-0 bg-zinc-900/20" />
          <div className="absolute inset-0 scan-sweep" />
          <div className="absolute inset-0 scan-grid opacity-40" />
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/90 dark:bg-zinc-900/90 text-[11px] font-semibold text-zinc-900 dark:text-zinc-100 shadow">
            {labels[phase]}…
          </span>
        </div>

        {/* Noosho + what she's up to */}
        <div className="mt-4 flex items-end gap-3">
          <div className="shrink-0 -mb-1">
            <Mascot pose={POSE_BY_PHASE[phase]} size={112} title="Noosho" />
          </div>
          <SpeechBubble phase={phase} mode={activeMode} />
        </div>

        {/* progress + stepper */}
        <div className="relative h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden progress-bar mt-4 mb-4" />
        <div className="flex items-center justify-between">
          {labels.map((label, i) => {
            const done = i < phase;
            const active = i === phase;
            return (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                    done
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : active
                        ? "bg-orange-700 text-white"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {done ? (
                    <Check size={12} strokeWidth={3} />
                  ) : active ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-[11px] ${active ? "text-zinc-900 dark:text-zinc-100 font-medium" : "text-zinc-400"}`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* What the AI actually read off the photo — about the user's own room,
            so far more engaging than a spinner. */}
        {findings && findings.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-1.5 animate-fade-up">
            {findings.slice(0, 5).map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
              >
                <Check size={10} className="text-orange-700" />
                {f}
              </span>
            ))}
          </div>
        )}

        {hasCatalog && <Catalog catalog={catalog} picked={picked} />}

        {showItems && <ItemList items={items!} mode={activeMode} phase={phase} />}

        {/* The literal status line stays — the bubble is the fun layer on top. */}
        {statusMessage && <p className="text-xs text-zinc-400 text-center mt-5">{statusMessage}</p>}
      </div>
    </div>
  );
}
