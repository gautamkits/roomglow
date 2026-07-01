"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Sofa, PartyPopper, Sparkles, Lock } from "lucide-react";
import type { SavedDesign } from "@/lib/useUserLibrary";

interface DesignGridProps {
  designs: SavedDesign[];
  limit?: number;
  /** Fixed 2-column layout (e.g. in a narrow sidebar); default is responsive. */
  cols?: 2;
}

export default function DesignGrid({ designs, limit, cols }: DesignGridProps) {
  const router = useRouter();
  const shown = limit ? designs.slice(0, limit) : designs;
  const gridCls =
    cols === 2 ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 sm:grid-cols-3 gap-4";

  return (
    <div className={gridCls}>
      {shown.map((d) => (
        <button
          key={d.id}
          onClick={() => router.push(`/design/${d.id}`)}
          className="group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all text-left"
        >
          <div className="aspect-[4/3] relative overflow-hidden bg-stone-100 dark:bg-zinc-800">
            <Image
              src={d.generated_image_url}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, 33vw"
              className={`object-cover transition-transform duration-300 ${
                d.is_unlocked
                  ? "group-hover:scale-[1.03]"
                  : "blur-xl scale-110 select-none pointer-events-none"
              }`}
              {...(d.generated_blur
                ? { placeholder: "blur" as const, blurDataURL: d.generated_blur }
                : {})}
            />
            {!d.is_unlocked && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/15">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-zinc-900/70 backdrop-blur-sm px-3 py-1.5 rounded-full">
                  <Lock size={12} />
                  Unlock
                </span>
              </div>
            )}
            <span
              className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${
                d.mode === "event"
                  ? "bg-purple-100/90 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300"
                  : d.mode === "makeover"
                  ? "bg-pink-100/90 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300"
                  : "bg-teal-100/90 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300"
              }`}
            >
              {d.mode === "event" ? (
                <PartyPopper size={10} />
              ) : d.mode === "makeover" ? (
                <Sparkles size={10} />
              ) : (
                <Sofa size={10} />
              )}
              {d.mode === "event"
                ? d.event_config?.eventLabel || "Event"
                : d.mode === "makeover"
                ? "Makeover"
                : "Space"}
            </span>
          </div>
          <div className="p-3">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
              {d.mode === "event"
                ? d.event_config?.subTheme || "Decoration"
                : d.mode === "makeover"
                ? d.event_config?.styleLabel || "New look"
                : "Room redesign"}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {new Date(d.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
