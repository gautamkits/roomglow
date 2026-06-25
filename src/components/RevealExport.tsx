"use client";

import { useState } from "react";
import { Film, Copy, Check, Download } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { designTitle, designDescription, designItems } from "@/lib/admin";
import {
  generateRevealVideo,
  isRevealVideoSupported,
  type RevealAspect,
} from "@/lib/revealVideo";

const ASPECTS: { id: RevealAspect; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "9:16", label: "9:16" },
];

export interface RevealDesign {
  id: string;
  mode?: string;
  room_analysis?: Record<string, unknown> | string | null;
  event_config?: Record<string, unknown> | string | null;
  design_narrative?: string;
  products?: unknown;
  selected_items?: unknown;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function RevealExport({ design }: { design: RevealDesign }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [aspect, setAspect] = useState<RevealAspect>("original");

  const supported = isRevealVideoSupported();
  const title = designTitle(design);
  const description = designDescription(design);
  const link = `${SITE_URL}/design/${design.id}`;
  const tags = designItems(design)
    .slice(0, 4)
    .map((t) => "#" + t.toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter((t) => t.length > 1);
  const caption = `${title}\n\n${description}\n\n✨ See it & shop the look: ${link}\n\n${[
    "#noosho",
    "#interiordesign",
    "#homedecor",
    ...tags,
  ].join(" ")}`;

  const exportVideo = async () => {
    setBusy(true);
    setError(null);
    setPct(0);
    try {
      const blob = await generateRevealVideo(
        {
          beforeUrl: `/api/image/${design.id}/before?inline=1`,
          afterUrl: `/api/image/${design.id}/after?inline=1`,
          aspect,
        },
        (f) => setPct(Math.round(f * 100))
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `noosho-${slugify(title) || design.id.slice(0, 8)}-${aspect.replace(
        ":",
        "x"
      )}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy — select the text manually.");
    }
  };

  return (
    <div className="mt-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
      {supported ? (
        <>
          <div className="flex items-center gap-1 mb-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
            {ASPECTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAspect(a.id)}
                disabled={busy}
                className={`flex-1 px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
                  aspect === a.id
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
          <button
            onClick={exportVideo}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Film size={15} />
            {busy ? `Rendering… ${pct}%` : "Export reveal MP4"}
          </button>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            {aspect === "original"
              ? "Matches the photo — no bands, nothing cropped."
              : "Fills the frame — no bands; edges may be trimmed."}
          </p>
        </>
      ) : (
        <div className="text-xs text-zinc-500">
          <p className="mb-1.5">Open in Chrome or Edge to export the MP4.</p>
          <a
            href={`/api/share/${design.id}`}
            download={`noosho-${design.id.slice(0, 8)}.gif`}
            className="inline-flex items-center gap-1.5 text-orange-700 hover:text-orange-800 font-medium"
          >
            <Download size={14} /> Download GIF instead
          </a>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wide text-zinc-400">
            Caption
          </span>
          <button
            onClick={copyCaption}
            className="inline-flex items-center gap-1 text-xs text-orange-700 hover:text-orange-800 font-medium"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy caption"}
          </button>
        </div>
        <pre className="whitespace-pre-wrap break-words text-xs text-zinc-600 dark:text-zinc-300 bg-stone-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 font-sans leading-relaxed">
{caption}
        </pre>
      </div>
    </div>
  );
}
