"use client";

import { useState } from "react";
import { Share2, Download, Link2, Check } from "lucide-react";

export default function ShareButton({
  designId,
  variant = "full",
}: {
  designId: string;
  variant?: "full" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pageUrl = `${origin}/design/${designId}`;
  const gifUrl = `${origin}/api/share/${designId}`;

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Noosho design",
          text: "Check out this room transformation made with Noosho",
          url: pageUrl,
        });
        return;
      } catch {
        // fell through to menu
      }
    }
    setOpen((o) => !o);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const base =
    variant === "ghost"
      ? "text-zinc-500 hover:text-orange-700"
      : "border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700";

  return (
    <div className="relative inline-block">
      <button
        onClick={nativeShare}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${base}`}
      >
        <Share2 size={15} />
        Share
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 w-52 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-1.5">
            <a
              href={gifUrl}
              download={`noosho-${designId.slice(0, 8)}.gif`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Download size={15} className="text-orange-700" />
              Download before/after GIF
            </a>
            <button
              onClick={copyLink}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {copied ? (
                <Check size={15} className="text-green-600" />
              ) : (
                <Link2 size={15} className="text-orange-700" />
              )}
              {copied ? "Link copied!" : "Copy link"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
