"use client";

import { Calendar } from "lucide-react";
import { daysUntil, type EventDate } from "@/lib/useUserLibrary";

interface UpcomingEventsProps {
  eventDates: EventDate[];
}

export default function UpcomingEvents({ eventDates }: UpcomingEventsProps) {
  if (eventDates.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">
        Upcoming events
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {eventDates.map((ed, i) => {
          const days = daysUntil(ed.event_date);
          return (
            <div
              key={i}
              className="flex-shrink-0 px-4 py-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center">
                <Calendar size={16} className="text-orange-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {ed.event_label}
                </p>
                <p className="text-xs text-zinc-500">
                  {days === 0 ? "Today!" : `in ${days} days`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
