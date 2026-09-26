"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { ChevronsLeftRight } from "lucide-react";
import Mascot, { type MascotPose } from "./Mascot";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  rounded?: boolean;
  /** Tailwind object-position class(es) for the cropped fill, e.g.
   *  "object-[50%_38%]". Only meaningful alongside `aspect`. A frame taller
   *  than the photo crops it, and a room's subject sits above centre — dead
   *  centre fills the bottom half with carpet. Both images get the same value
   *  so the before/after wipe stays registered. */
  objectPosition?: string;
  /** Tailwind aspect class (e.g. "aspect-[4/3]"). When set, images are
   *  optimized via next/image (fill) and cropped to the ratio. */
  aspect?: string;
  showLabels?: boolean;
  blurBefore?: string | null;
  blurAfter?: string | null;
  sizes?: string;
  /** Eager-load + high fetch priority — set on above-the-fold cards for LCP. */
  priority?: boolean;
  /** Noosho rides the handle and demos the slide once. Large sliders only —
   *  the gallery mounts dozens of these and already has its own Noosho. */
  mascot?: boolean;
}

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  rounded = true,
  aspect,
  objectPosition = "",
  showLabels = true,
  blurBefore,
  blurAfter,
  sizes = "(max-width: 640px) 50vw, 25vw",
  priority = false,
  mascot = false,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  // Holds the teardown for the current drag session's window listeners, if any.
  const cleanupRef = useRef<(() => void) | null>(null);
  // Noosho: is the handle moving (drag or demo), which way, and has the demo run.
  const [moving, setMoving] = useState(false);
  const [dir, setDir] = useState(0);
  const lastPos = useRef(50);
  const demoCancelled = useRef(false);
  const movingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  // Track direction + "is moving" for Noosho's lean and excitement.
  useEffect(() => {
    if (!mascot) return;
    const d = pos - lastPos.current;
    if (Math.abs(d) > 0.3) {
      setDir(Math.sign(d));
      setMoving(true);
      if (movingTimer.current) clearTimeout(movingTimer.current);
      movingTimer.current = setTimeout(() => setMoving(false), 180);
    }
    lastPos.current = pos;
  }, [pos, mascot]);

  // Noosho demos the slide once, the first time the slider is properly in
  // view: before → after (excited), then eases back to the middle and hands
  // over. Any touch or drag cancels it; skipped under reduced motion.
  useEffect(() => {
    if (!mascot) return;
    const el = containerRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    const tween = (from: number, to: number, ms: number) =>
      new Promise<void>((done) => {
        const t0 = performance.now();
        const step = (now: number) => {
          if (demoCancelled.current) return done();
          const k = Math.min(1, (now - t0) / ms);
          setPos(from + (to - from) * ease(k));
          if (k < 1) raf = requestAnimationFrame(step);
          else done();
        };
        raf = requestAnimationFrame(step);
      });
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        await new Promise((r) => setTimeout(r, 500));
        if (demoCancelled.current) return;
        await tween(50, 88, 700);
        await tween(88, 6, 1500);
        await new Promise((r) => setTimeout(r, 900));
        await tween(6, 50, 700);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [mascot]);

  // Attach move/end listeners ONLY while dragging (added on pointer-down, removed
  // on release). Avoids ~4 always-on window listeners per instance — critical on
  // the gallery where dozens of sliders mount at once (TBT/INP win).
  const startDrag = useCallback(
    (clientX: number) => {
      demoCancelled.current = true;
      setFromClientX(clientX);
      const move = (e: MouseEvent) => setFromClientX(e.clientX);
      const touch = (e: TouchEvent) =>
        e.touches[0] && setFromClientX(e.touches[0].clientX);
      const stop = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", stop);
        window.removeEventListener("touchmove", touch);
        window.removeEventListener("touchend", stop);
        cleanupRef.current = null;
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", stop);
      window.addEventListener("touchmove", touch, { passive: true });
      window.addEventListener("touchend", stop, { passive: true });
      cleanupRef.current = stop;
    },
    [setFromClientX]
  );

  // Clean up if unmounted mid-drag.
  useEffect(() => () => cleanupRef.current?.(), []);

  const beforeClip = { clipPath: `inset(0 ${100 - pos}% 0 0)` };

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none overflow-hidden touch-pan-y ${
        rounded ? "rounded-2xl" : ""
      } ${aspect || ""} border border-zinc-200 dark:border-zinc-800 shadow-lg cursor-ew-resize`}
      onMouseDown={(e) => startDrag(e.clientX)}
      onTouchStart={(e) => e.touches[0] && startDrag(e.touches[0].clientX)}
    >
      {aspect ? (
        <>
          <Image
            src={afterSrc}
            alt={afterLabel}
            fill
            sizes={sizes}
            draggable={false}
            priority={priority}
            className={`object-cover ${objectPosition}`}
            {...(blurAfter ? { placeholder: "blur" as const, blurDataURL: blurAfter } : {})}
          />
          <Image
            src={beforeSrc}
            alt={beforeLabel}
            fill
            sizes={sizes}
            draggable={false}
            className={`object-cover ${objectPosition}`}
            style={beforeClip}
            {...(blurBefore ? { placeholder: "blur" as const, blurDataURL: blurBefore } : {})}
          />
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={afterSrc} alt={afterLabel} className="block w-full" draggable={false} loading="lazy" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeSrc}
            alt={beforeLabel}
            className="absolute inset-0 w-full h-full object-cover"
            style={beforeClip}
            draggable={false}
            loading="lazy"
          />
        </>
      )}

      {showLabels && (
        <>
          <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-zinc-900/70 text-white text-xs font-medium backdrop-blur-sm">
            {afterLabel}
          </span>
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/80 text-zinc-900 text-xs font-medium backdrop-blur-sm">
            {beforeLabel}
          </span>
        </>
      )}

      {/* Handle */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.1)]"
        style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center">
          <ChevronsLeftRight size={16} className="text-zinc-700" />
        </div>
        {mascot && <NooshoOnHandle pos={pos} moving={moving} dir={dir} />}
      </div>
    </div>
  );
}

/**
 * Noosho at the foot of the divider, hands on the handle. Her mood follows the
 * reveal: curious while it's mostly "before", excited while it moves, and she
 * celebrates once it's (nearly) all "after". pos = share of "before" showing.
 */
function NooshoOnHandle({ pos, moving, dir }: { pos: number; moving: boolean; dir: number }) {
  const allAfter = pos < 12;
  const pose: MascotPose = allAfter ? "celebrate" : moving ? "wave" : pos > 70 ? "peek" : "idle";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-1 left-1/2 w-[64px] sm:w-[84px]"
      style={{
        transform: `translateX(-50%) rotate(${moving ? dir * 9 : 0}deg)`,
        transformOrigin: "50% 100%",
        transition: "transform 160ms ease-out",
      }}
    >
      <Mascot pose={pose} mouth={moving ? "wide" : undefined} size={110} className="w-full h-auto" title="Noosho" />
      {allAfter && (
        <span className="absolute -top-3 inset-x-0 flex justify-between text-amber-300 text-lg animate-bubble-pop">
          <span>✦</span>
          <span className="-mt-3">✦</span>
          <span>✦</span>
        </span>
      )}
    </div>
  );
}
