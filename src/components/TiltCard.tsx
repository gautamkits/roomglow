"use client";

import { useRef, useCallback, type CSSProperties, type ReactNode } from "react";

/**
 * Cheap "3D" tilt-on-hover wrapper: rotates children in perspective following
 * the cursor. GPU-composited transforms only, rAF-throttled, mouse-only (no
 * effect on touch), and inert under prefers-reduced-motion (see globals.css).
 */
export default function TiltCard({
  children,
  className = "",
  style,
  maxTilt = 5,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  maxTilt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse") return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${(-py * maxTilt).toFixed(2)}deg) rotateY(${(px * maxTilt).toFixed(2)}deg)`;
      });
    },
    [maxTilt]
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    el.style.transform = "";
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`tilt-card transition-transform duration-200 ease-out ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
