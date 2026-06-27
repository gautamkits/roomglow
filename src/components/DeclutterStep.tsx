"use client";

import { useState } from "react";
import Image from "next/image";
import { Eraser, Check, Sparkles } from "lucide-react";
import type { RemovableObject } from "@/lib/types";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";

interface DeclutterStepProps {
  originalImage: string;
  removableObjects: RemovableObject[];
  emptiedImage: string | null;
  isEmptying: boolean;
  /** Empty the room, keeping the objects whose ids are passed. */
  onConfirm: (keepIds: string[]) => void;
  /** Accept the emptied preview and continue to product selection. */
  onContinue: () => void;
  /** Keep the room as-is and continue on the original photo. */
  onSkip: () => void;
}

export default function DeclutterStep({
  originalImage,
  removableObjects,
  emptiedImage,
  isEmptying,
  onConfirm,
  onContinue,
  onSkip,
}: DeclutterStepProps) {
  // Default: clear everything. Objects in this set are kept.
  const [keepIds, setKeepIds] = useState<Set<string>>(new Set());

  const toggleKeep = (id: string) => {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Preview stage: emptied room is ready, ask the user to confirm ───
  if (emptiedImage) {
    return (
      <div className="py-10 max-w-2xl mx-auto">
        <div className="mb-7 animate-fade-up">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1.5">
            Here&apos;s your space, cleared
          </h2>
          <p className="text-sm text-zinc-500">
            We&apos;ll design on this clean canvas for the best result. Drag the
            handle to compare.
          </p>
        </div>

        <div className="animate-fade-up-delay-1 max-w-xl mx-auto">
          <BeforeAfterSlider
            beforeSrc={originalImage}
            afterSrc={emptiedImage}
            beforeLabel="Your room"
            afterLabel="Cleared"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-7 animate-fade-up-delay-2">
          <button
            onClick={onContinue}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white font-medium text-sm rounded-lg transition-colors"
          >
            <Check size={16} />
            Looks good, continue
          </button>
          <button
            onClick={() => onConfirm(Array.from(keepIds))}
            disabled={isEmptying}
            className="flex items-center gap-2 px-5 py-2.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-sm rounded-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors disabled:opacity-50"
          >
            {isEmptying ? "Clearing…" : "Try clearing again"}
          </button>
          <button
            onClick={onSkip}
            className="text-sm text-zinc-500 hover:text-orange-700 transition-colors px-2"
          >
            Keep my room as-is
          </button>
        </div>
      </div>
    );
  }

  // ─── Selection stage: pick what to keep, then clear ───
  return (
    <div className="py-10 max-w-2xl mx-auto">
      <div className="mb-6 animate-fade-up">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 text-xs font-medium mb-3">
          <Sparkles size={12} />
          Recommended
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-1.5">
          Let&apos;s clear your space first
        </h2>
        <p className="text-sm text-zinc-500">
          Your room already has furniture in it. Designing on a clean, empty
          space gives a much better result. We&apos;ll remove the items below —
          tap any you&apos;d like to keep.
        </p>
      </div>

      <div className="animate-fade-up-delay-1 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 mb-5 relative aspect-[4/3]">
        <Image
          src={originalImage}
          alt="Your uploaded room"
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 640px"
          unoptimized
        />
      </div>

      {removableObjects.length > 0 && (
        <div className="animate-fade-up-delay-1 mb-7">
          <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2">
            Items we&apos;ll remove · tap to keep
          </p>
          <div className="flex flex-wrap gap-2">
            {removableObjects.map((obj) => {
              const kept = keepIds.has(obj.id);
              return (
                <button
                  key={obj.id}
                  onClick={() => toggleKeep(obj.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    kept
                      ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-400 line-through"
                  }`}
                >
                  {kept ? <Check size={13} /> : <Eraser size={13} />}
                  {obj.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            {keepIds.size === 0
              ? "Everything will be cleared."
              : `Keeping ${keepIds.size} item${keepIds.size > 1 ? "s" : ""}.`}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 animate-fade-up-delay-2">
        <button
          onClick={() => onConfirm(Array.from(keepIds))}
          disabled={isEmptying}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-60"
        >
          {isEmptying ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Clearing your space…
            </>
          ) : (
            <>
              <Eraser size={16} />
              Clear my space
            </>
          )}
        </button>
        <button
          onClick={onSkip}
          disabled={isEmptying}
          className="text-sm text-zinc-500 hover:text-orange-700 transition-colors px-2 disabled:opacity-50"
        >
          Keep my room as-is
        </button>
      </div>
    </div>
  );
}
