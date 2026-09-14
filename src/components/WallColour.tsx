import type { WallPaint } from "@/lib/types";

/** Only a real 3- or 6-digit hex reaches `style` — the value is model output. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * The wall colour a space design repainted damaged walls in. Colour only, not a
 * shoppable product: it sits with the design note, not in "Shop the look".
 */
export default function WallColour({ paint }: { paint: WallPaint }) {
  const hex = HEX.test(paint.hex) ? paint.hex : null;
  return (
    <div className="mb-4 flex items-center gap-3 max-w-2xl">
      {hex && (
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm"
          style={{ backgroundColor: hex }}
        />
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-snug">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          Walls repainted: {paint.colorName}
        </span>
        {paint.finish ? `, ${paint.finish}` : ""}
        {hex ? ` (${hex.toUpperCase()})` : ""}
        {paint.reason ? <span className="block text-xs mt-0.5">{paint.reason}</span> : null}
      </p>
    </div>
  );
}
