"use client";

import { useEffect, useState } from "react";

const WORDS = ["kitchen", "bedroom", "living room", "patio", "backyard", "office"];

// Headline whose subject word cycles through room types. Pauses under
// prefers-reduced-motion (shows the first word statically). The `key` on the
// word remounts it each tick so the fade-up animation replays.
export default function RotatingHeadline() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((v) => (v + 1) % WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1]">
      See your{" "}
      <span
        key={i}
        className="inline-block text-orange-700 bg-orange-50 dark:bg-orange-950/30 rounded-xl px-2.5 animate-fade-up"
      >
        {WORDS[i]}
      </span>{" "}
      redesigned
    </h1>
  );
}
