interface MarkProps {
  size?: number;
  className?: string;
}

/** Twin Rings — the "oo" of noosho as two interlocking rings.
 *  Left ring inherits currentColor (adapts to light/dark); right ring is Clay. */
export function TwinRings({ size = 22, className = "" }: MarkProps) {
  const width = (size * 40) / 28;
  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 40 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="13" cy="14" r="11" stroke="currentColor" strokeWidth="4" />
      <circle cx="27" cy="14" r="11" stroke="#BD6A43" strokeWidth="4" />
    </svg>
  );
}

export default function Logo({
  markSize = 22,
  wordmarkClassName = "text-lg",
  className = "",
}: {
  markSize?: number;
  wordmarkClassName?: string;
  className?: string;
}) {
  return (
    <span
      className={`flex items-center gap-2 text-zinc-900 dark:text-zinc-50 ${className}`}
    >
      <TwinRings size={markSize} />
      <span
        className={`font-semibold tracking-tight lowercase ${wordmarkClassName}`}
        style={{ fontFamily: "var(--font-sora), var(--font-geist-sans), sans-serif" }}
      >
        noosho
      </span>
    </span>
  );
}
