"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";

function getFingerprint(): string {
  try {
    let fp = localStorage.getItem("rg_fp");
    if (!fp) {
      fp = crypto.randomUUID();
      localStorage.setItem("rg_fp", fp);
    }
    return fp;
  } catch {
    return "anon";
  }
}

export default function LikeButton({
  designId,
  initialCount,
  size = "sm",
}: {
  designId: string;
  initialCount: number;
  size?: "sm" | "lg";
}) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const set = JSON.parse(localStorage.getItem("rg_liked") || "[]");
      if (Array.isArray(set) && set.includes(designId)) setLiked(true);
    } catch {}
  }, [designId]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    // optimistic
    setLiked((l) => !l);
    setCount((c) => c + (liked ? -1 : 1));
    try {
      const res = await fetch("/api/gallery/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, fingerprint: getFingerprint() }),
      });
      const data = await res.json();
      if (res.ok) {
        setCount(data.likeCount);
        setLiked(data.liked);
        try {
          const set = JSON.parse(localStorage.getItem("rg_liked") || "[]");
          const next = data.liked
            ? [...new Set([...set, designId])]
            : set.filter((id: string) => id !== designId);
          localStorage.setItem("rg_liked", JSON.stringify(next));
        } catch {}
      }
    } catch {
      // revert on failure
      setLiked((l) => !l);
      setCount((c) => c + (liked ? 1 : -1));
    } finally {
      setBusy(false);
    }
  };

  const lg = size === "lg";
  return (
    <button
      onClick={toggle}
      aria-label={liked ? "Unlike" : "Like"}
      aria-pressed={liked}
      className={`flex items-center gap-1.5 rounded-full border transition-colors ${
        lg ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-xs"
      } ${
        liked
          ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30"
          : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      <Heart
        size={lg ? 16 : 13}
        className={liked ? "fill-orange-600 text-orange-600" : ""}
      />
      {count}
    </button>
  );
}
