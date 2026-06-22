"use client";

import { useRouter } from "next/navigation";
import { Sofa, PartyPopper } from "lucide-react";
import type { SavedDesign } from "@/lib/useUserLibrary";

interface DesignGridProps {
  designs: SavedDesign[];
  limit?: number;
}

export default function DesignGrid({ designs, limit }: DesignGridProps) {
  const router = useRouter();
  const shown = limit ? designs.slice(0, limit) : designs;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {shown.map((d) => (
        <button
          key={d.id}
          onClick={() => router.push(`/design/${d.id}`)}
          className="group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all text-left"
        >
          <div className="aspect-[4/3] relative overflow-hidden bg-stone-100 dark:bg-zinc-800">
            <img
              src={d.generated_image_url}
              alt=""
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            <span
              className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${
                d.mode === "event"
                  ? "bg-purple-100/90 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300"
                  : "bg-teal-100/90 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300"
              }`}
            >
              {d.mode === "event" ? <PartyPopper size={10} /> : <Sofa size={10} />}
              {d.mode === "event"
                ? d.event_config?.eventLabel || "Event"
                : "Space"}
            </span>
          </div>
          <div className="p-3">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 line-clamp-1">
              {d.mode === "event"
                ? d.event_config?.subTheme || "Decoration"
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
