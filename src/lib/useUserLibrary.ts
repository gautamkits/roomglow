"use client";

import { useEffect, useState } from "react";

export interface SavedDesign {
  id: string;
  mode: string;
  event_config: Record<string, string> | null;
  design_narrative: string;
  generated_image_url: string;
  generated_blur?: string | null;
  is_unlocked: boolean;
  created_at: string;
}

export interface EventDate {
  event_type: string;
  event_label: string;
  event_date: string;
  honoree?: string | null;
}

export function useUserLibrary(enabled: boolean) {
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [eventDates, setEventDates] = useState<EventDate[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    fetch("/api/user/designs")
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        setDesigns(data.designs || []);
        setEventDates(data.eventDates || []);
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [enabled]);

  return { designs, eventDates, loading };
}

export function daysUntil(dateStr: string): number {
  const eventDate = new Date(dateStr);
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  if (thisYear < now) thisYear.setFullYear(thisYear.getFullYear() + 1);
  return Math.ceil((thisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
