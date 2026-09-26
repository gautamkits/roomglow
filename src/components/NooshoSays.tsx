import type { ReactNode } from "react";
import Mascot, { type MascotPose } from "./Mascot";

/**
 * Noosho with a speech bubble — the small guide that walks the user through
 * every step of the design journey. Keyed on the message, so each new line
 * pops in rather than silently swapping.
 */
export default function NooshoSays({
  pose = "idle",
  size = 60,
  className = "",
  children,
}: {
  pose?: MascotPose;
  size?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-end gap-2.5 ${className}`}>
      <div className="shrink-0 -mb-0.5">
        <Mascot pose={pose} size={size} title="Noosho" />
      </div>
      <div
        key={typeof children === "string" ? children : undefined}
        className="animate-bubble-pop min-w-0 rounded-2xl rounded-bl-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm px-3.5 py-2 mb-1.5 text-sm text-zinc-800 dark:text-zinc-100"
      >
        {children}
      </div>
    </div>
  );
}
