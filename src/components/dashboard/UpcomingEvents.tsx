"use client";

import { Calendar } from "lucide-react";
import { daysUntil, type EventDate } from "@/lib/useUserLibrary";
import { isOneTimeEvent } from "@/lib/events";

interface UpcomingEventsProps {
  eventDates: EventDate[];
  /** "row" = horizontal scroll (full-width); "list" = compact vertical (sidebar). */
  variant?: "row" | "list";
}

export default function UpcomingEvents({ eventDates, variant = "row" }: UpcomingEventsProps) {
  // One-off life events (baby shower, housewarming) don't recur annually, so
  // they'd otherwise reappear as "upcoming" next year via daysUntil's roll-over.
  const events = eventDates.filter((ed) => !isOneTimeEvent(ed.event_type));
  if (events.length === 0) return null;

  const Card = ({ ed }: { ed: EventDate }) => {
    const days = daysUntil(ed.event_date);
    return (
      <div
        className={`${
          variant === "list" ? "w-full" : "flex-shrink-0"
        } px-3.5 py-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3`}
      >
        <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
          <Calendar size={16} className="text-orange-700" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {ed.event_label}
          </p>
          <p className="text-xs text-zinc-500">
            {days === 0 ? "Today!" : `in ${days} day${days === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">
        Upcoming events
      </h2>
      {variant === "list" ? (
        <div className="space-y-2">
          {events.slice(0, 4).map((ed, i) => (
            <Card key={i} ed={ed} />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {events.map((ed, i) => (
            <Card key={i} ed={ed} />
          ))}
        </div>
      )}
    </div>
  );
}
