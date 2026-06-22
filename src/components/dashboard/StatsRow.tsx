"use client";

import { LayoutGrid, Sofa, PartyPopper, Calendar } from "lucide-react";
import type { SavedDesign, EventDate } from "@/lib/useUserLibrary";

interface StatsRowProps {
  designs: SavedDesign[];
  eventDates: EventDate[];
}

export default function StatsRow({ designs, eventDates }: StatsRowProps) {
  const spaceCount = designs.filter((d) => d.mode === "space").length;
  const eventCount = designs.filter((d) => d.mode === "event").length;

  const stats = [
    { label: "Total designs", value: designs.length, Icon: LayoutGrid },
    { label: "Spaces", value: spaceCount, Icon: Sofa },
    { label: "Events", value: eventCount, Icon: PartyPopper },
    { label: "Upcoming", value: eventDates.length, Icon: Calendar },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(({ label, value, Icon }) => (
        <div
          key={label}
          className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
        >
          <div className="flex items-center gap-1.5 text-zinc-400 mb-1.5">
            <Icon size={14} />
            <span className="text-xs">{label}</span>
          </div>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}
