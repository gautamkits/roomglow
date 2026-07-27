"use client";

import { useEffect, useRef } from "react";

/**
 * Fires once when a visitor looks like they're about to leave.
 *
 * Two triggers, picked by pointer type:
 * - **Fine pointer (desktop):** the cursor leaves the viewport through the top
 *   edge (address bar / tab strip).
 * - **Coarse pointer (mobile):** there is no cursor, so we trap exactly one
 *   back press via a same-URL history sentinel. This matters more than the
 *   desktop path — most ad traffic is Instagram Reels on a phone.
 *
 * Deliberately conservative: armed only after a dwell delay, fires at most once
 * per tab session, and stays off for a week once the visitor dismisses it or
 * hands over an email.
 */

const SEEN_KEY = "noosho-exit-intent-seen"; // sessionStorage — once per tab
const OFF_KEY = "noosho-exit-intent-off"; // localStorage — timestamp, one week
const OFF_MS = 7 * 24 * 60 * 60 * 1000;

/** Wait this long before arming, so it can't fire on a bounce-through. */
const ARM_DELAY_MS = 6000;

export type ExitTrigger = "mouseleave" | "back";

function isSuppressed(): boolean {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return true;
    const off = localStorage.getItem(OFF_KEY);
    if (off && Date.now() - Number(off) < OFF_MS) return true;
  } catch {
    // Storage blocked (private mode / in-app webview) — better to stay quiet
    // than to re-prompt on every page view.
    return true;
  }
  return false;
}

/** Stop offering it for a week — call on dismiss and on a successful capture. */
export function silenceExitIntent(): void {
  try {
    localStorage.setItem(OFF_KEY, String(Date.now()));
  } catch {}
}

export function useExitIntent(
  enabled: boolean,
  onTrigger: (trigger: ExitTrigger) => void
): void {
  const fired = useRef(false);
  const handler = useRef(onTrigger);
  handler.current = onTrigger;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (isSuppressed()) return;

    let armed = false;

    const teardown = () => {
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("popstate", onPopState);
    };

    const fire = (trigger: ExitTrigger) => {
      if (fired.current || !armed) return;
      fired.current = true;
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      // Detach immediately: the sentinel is spent, so the next back press
      // leaves the site normally.
      teardown();
      handler.current(trigger);
    };

    function onMouseOut(e: MouseEvent) {
      // relatedTarget is null only when the pointer left the document itself.
      if (e.relatedTarget) return;
      if (e.clientY > 0) return; // left sideways or downward — not an exit
      fire("mouseleave");
    }

    function onPopState() {
      fire("back");
    }

    const armTimer = window.setTimeout(() => {
      armed = true;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      if (coarse) {
        try {
          // Same URL, so nothing visible changes and Next's router stays in
          // sync; it just gives the back button something to consume.
          window.history.pushState(null, "", window.location.href);
          window.addEventListener("popstate", onPopState);
        } catch {}
      } else {
        document.addEventListener("mouseout", onMouseOut);
      }
    }, ARM_DELAY_MS);

    return () => {
      window.clearTimeout(armTimer);
      teardown();
    };
  }, [enabled]);
}
