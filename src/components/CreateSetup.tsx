"use client";

/**
 * Chooses the intake panel and owns the single /api/features read.
 *
 * Both panels previously fetched /api/features themselves just to decide
 * whether to offer makeover mode, which made the mode selector reflow from two
 * columns to three under the user's thumb. Resolving it here — behind a
 * fixed-height skeleton — means the layout is stable by the time anything is
 * interactive, and there's one request instead of one per panel.
 */

import { useEffect, useState, type ReactNode } from "react";
import type { AppMode, EventConfig, MakeoverConfig } from "@/lib/types";
import SetupPanel from "./SetupPanel";
import SetupPanelV2 from "./SetupPanelV2";

export interface SetupProps {
  onImageSelected: (
    base64: string,
    mode: AppMode,
    eventConfig: EventConfig | null,
    maxBudget?: number,
    makeoverConfig?: MakeoverConfig | null,
    noBudget?: boolean
  ) => void;
  /**
   * Card heading, rendered for v1 only. v2 gives every step its own heading, so
   * keeping this would leave "Upload a photo → see it transformed" sitting above
   * the screen that asks for the theme, two steps after the upload.
   */
  v1Header?: ReactNode;
}

export default function CreateSetup({ v1Header, ...props }: SetupProps) {
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  // ?create_v2=1 / =0 previews either intake without touching the global flag,
  // so the new flow can be checked on a real device before it's switched on for
  // everyone. Only ever selects a UI variant.
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("create_v2");
    if (q === "1") setOverride(true);
    else if (q === "0") setOverride(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/features")
      .then((r) => r.json())
      .then((d) => alive && setFeatures(d))
      // Failing closed means the current production flow, not a broken screen.
      .catch(() => alive && setFeatures({}));
    return () => {
      alive = false;
    };
  }, []);

  if (!features) {
    return (
      <div className="min-h-[60dvh] flex flex-col gap-2.5 pt-12" aria-busy>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[76px] rounded-2xl bg-zinc-100 dark:bg-zinc-900 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (override ?? features.create_v2) ? (
    <SetupPanelV2 {...props} makeoverEnabled={!!features.makeover} />
  ) : (
    <>
      {v1Header}
      <SetupPanel {...props} makeoverEnabled={!!features.makeover} />
    </>
  );
}
