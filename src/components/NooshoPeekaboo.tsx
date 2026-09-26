"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Mascot, { type MascotPose } from "./Mascot";

/**
 * Noosho plays peekaboo with the gallery.
 *
 * Her head pops up from behind the top edge of a design card (the body is
 * clipped by a container whose bottom sits exactly on the card's top edge, so
 * she reads as being *behind* it), with two little hands gripping the edge.
 * Hover — or tap, on touch screens — and she ducks and reappears behind a
 * different card. Left alone she hops around on her own, sometimes hides for a
 * while, sometimes waves. Once per visit she runs across the bottom of the
 * screen carrying a parcel.
 *
 * Cards opt in with `data-noosho-spot`. This component must be rendered inside
 * a `position: relative` ancestor that also contains those cards; positions are
 * computed relative to it. Purely decorative: aria-hidden, never blocks a card
 * click (only her own head takes pointer events), and under
 * prefers-reduced-motion she just sits still on one card.
 */

// Mascot height in px (only the top part shows) and how much of her peeks
// above the card edge. Bigger on wider screens, where cards are bigger.
const SMALL = { head: 70, show: 36 };
const LARGE = { head: 96, show: 48 };

type Spot = { left: number; top: number };

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function NooshoPeekaboo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState(SMALL);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setDims(mq.matches ? LARGE : SMALL);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const HEAD = dims.head;
  const SHOW = dims.show;
  const [spotIdx, setSpotIdx] = useState<number | null>(null);
  const [pos, setPos] = useState<Spot | null>(null);
  const [up, setUp] = useState(false); // popped up vs ducked behind the card
  const [pose, setPose] = useState<MascotPose>("idle");
  const [finds, setFinds] = useState(0);
  const busy = useRef(false);

  const cards = useCallback((): HTMLElement[] => {
    const scope = rootRef.current?.parentElement;
    return scope ? Array.from(scope.querySelectorAll<HTMLElement>("[data-noosho-spot]")) : [];
  }, []);

  /** Where she'd sit on card `i`: near its top-right, just above the edge. */
  const spotFor = useCallback(
    (i: number): Spot | null => {
      const scope = rootRef.current?.parentElement;
      const el = cards()[i];
      if (!scope || !el) return null;
      const s = scope.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const width = (HEAD * 200) / 260;
      return { left: r.right - s.left - width - 14, top: r.top - s.top - SHOW };
    },
    [cards, HEAD, SHOW]
  );

  /** A card that is on screen right now, other than the current one. */
  const pickSpot = useCallback(
    (exclude: number | null): number | null => {
      const all = cards();
      const vh = window.innerHeight;
      const visible = all
        .map((el, i) => ({ i, r: el.getBoundingClientRect() }))
        .filter(({ i, r }) => i !== exclude && r.top > 70 && r.top < vh - 120);
      const pool = visible.length ? visible : all.map((_, i) => ({ i })).filter(({ i }) => i !== exclude);
      if (!pool.length) return null;
      return pool[Math.floor(Math.random() * pool.length)].i;
    },
    [cards]
  );

  /** Duck behind the current card, then pop up behind another one. */
  const hop = useCallback(
    (opts: { hideFor?: number; found?: boolean } = {}) => {
      if (busy.current) return;
      busy.current = true;
      if (opts.found) setPose("wave"); // "ah, you found me!"
      const duckAfter = opts.found ? 260 : 0;
      setTimeout(() => setUp(false), duckAfter);
      setTimeout(() => {
        const next = pickSpot(spotIdx);
        if (next != null) {
          setSpotIdx(next);
          setPos(spotFor(next));
        }
        setPose("idle");
        setTimeout(() => {
          setUp(true);
          busy.current = false;
        }, 60);
      }, duckAfter + 420 + (opts.hideFor ?? 0));
    },
    [pickSpot, spotFor, spotIdx]
  );

  // First appearance.
  useEffect(() => {
    const t = setTimeout(() => {
      const first = pickSpot(null);
      if (first == null) return;
      setSpotIdx(first);
      setPos(spotFor(first));
      setTimeout(() => setUp(true), 60);
    }, 1400);
    return () => clearTimeout(t);
  }, [pickSpot, spotFor]);

  // Keep her glued to her card through resizes, and follow the page if her
  // card scrolls away.
  useEffect(() => {
    const onResize = () => spotIdx != null && setPos(spotFor(spotIdx));
    onResize(); // also re-place her when her size (and so spotFor) changes
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [spotIdx, spotFor]);

  // Life when nobody is chasing her: hop, hide, or wave now and then.
  useEffect(() => {
    if (prefersReducedMotion() || spotIdx == null) return;
    const t = setTimeout(() => {
      const roll = Math.random();
      if (roll < 0.55) hop();
      else if (roll < 0.8) hop({ hideFor: 3500 }); // hiding…
      else {
        setPose("wave");
        setTimeout(() => setPose("idle"), 1600);
      }
    }, 9000 + Math.random() * 7000);
    return () => clearTimeout(t);
  }, [spotIdx, pose, hop]);

  const onFound = () => {
    if (prefersReducedMotion()) return;
    setFinds((n) => n + 1);
    hop({ found: true });
  };

  // After a few finds she celebrates instead of just ducking.
  useEffect(() => {
    if (finds > 0 && finds % 4 === 0) {
      setPose("celebrate");
      const t = setTimeout(() => setPose("idle"), 1400);
      return () => clearTimeout(t);
    }
  }, [finds]);

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {pos && (
        <div
          className="absolute overflow-hidden"
          style={{ left: pos.left, top: pos.top, width: (HEAD * 200) / 260, height: SHOW }}
        >
          <div
            className="pointer-events-auto cursor-pointer"
            onPointerEnter={(e) => e.pointerType === "mouse" && onFound()}
            onClick={onFound}
            style={{
              transform: `translateY(${up ? 0 : SHOW + 4}px)`,
              transition: "transform 380ms cubic-bezier(.3,1.5,.5,1)",
              marginTop: -8,
            }}
          >
            <Mascot pose={pose} size={HEAD} title="Noosho" />
          </div>
        </div>
      )}
      {/* little hands gripping the card's edge */}
      {pos && (
        <div
          className="absolute flex justify-between"
          style={{
            left: pos.left + 8,
            top: pos.top + SHOW - 5,
            width: (HEAD * 200) / 260 - 16,
            opacity: up ? 1 : 0,
            transform: `translateY(${up ? 0 : 6}px)`,
            transition: "opacity 200ms, transform 300ms",
          }}
        >
          <span className="block w-3.5 h-2.5 rounded-full" style={{ background: "#A95A36" }} />
          <span className="block w-3.5 h-2.5 rounded-full" style={{ background: "#A95A36" }} />
        </div>
      )}
      <NooshoRun />
    </div>
  );
}

/** Once per visit, after a while, Noosho scurries across the bottom of the screen. */
function NooshoRun() {
  const [run, setRun] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    try {
      if (sessionStorage.getItem("noosho-ran")) return;
    } catch {
      /* storage blocked — still fine to run once */
    }
    const go = () => {
      setRun(true);
      try {
        sessionStorage.setItem("noosho-ran", "1");
      } catch {
        /* ignore */
      }
      setTimeout(() => setRun(false), 5200);
    };
    // Browsers pause animations in background tabs. If the page is hidden when
    // the moment comes, wait until it's visible — otherwise the one run per
    // visit would happen unseen and be spent.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onVisible);
        go();
      }
    };
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") go();
      else document.addEventListener("visibilitychange", onVisible);
    }, 22000);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (!run) return null;
  return (
    <div className="fixed bottom-2 left-0 z-50 pointer-events-none noosho-run">
      <Mascot pose="carry" size={84} title="Noosho" />
    </div>
  );
}
