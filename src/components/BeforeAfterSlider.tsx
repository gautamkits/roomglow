"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { ChevronsLeftRight } from "lucide-react";

interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  rounded?: boolean;
  /** Tailwind aspect class (e.g. "aspect-[4/3]"). When set, images are
   *  optimized via next/image (fill) and cropped to the ratio. */
  aspect?: string;
  showLabels?: boolean;
  blurBefore?: string | null;
  blurAfter?: string | null;
  sizes?: string;
}

export default function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  rounded = true,
  aspect,
  showLabels = true,
  blurBefore,
  blurAfter,
  sizes = "(max-width: 640px) 50vw, 25vw",
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const setFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, pct)));
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => dragging.current && setFromClientX(e.clientX);
    const touch = (e: TouchEvent) =>
      dragging.current && e.touches[0] && setFromClientX(e.touches[0].clientX);
    const stop = () => (dragging.current = false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchmove", touch, { passive: true });
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchmove", touch);
      window.removeEventListener("touchend", stop);
    };
  }, [setFromClientX]);

  const beforeClip = { clipPath: `inset(0 ${100 - pos}% 0 0)` };

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none overflow-hidden ${
        rounded ? "rounded-2xl" : ""
      } ${aspect || ""} border border-zinc-200 dark:border-zinc-800 shadow-lg cursor-ew-resize`}
      onMouseDown={(e) => {
        dragging.current = true;
        setFromClientX(e.clientX);
      }}
      onTouchStart={(e) => {
        dragging.current = true;
        if (e.touches[0]) setFromClientX(e.touches[0].clientX);
      }}
    >
      {aspect ? (
        <>
          <Image
            src={afterSrc}
            alt={afterLabel}
            fill
            sizes={sizes}
            draggable={false}
            className="object-cover"
            {...(blurAfter ? { placeholder: "blur" as const, blurDataURL: blurAfter } : {})}
          />
          <Image
            src={beforeSrc}
            alt={beforeLabel}
            fill
            sizes={sizes}
            draggable={false}
            className="object-cover"
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
      </div>
    </div>
  );
}
