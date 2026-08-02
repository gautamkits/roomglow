"use client";

import { useState } from "react";
import { Check, ArrowRight, Trash2, Sparkles } from "lucide-react";
import { recommendedClears, type RemovableObject } from "@/lib/types";

interface TidyUpSelectionProps {
  /** The uploaded room/venue photo (data URL) — shown so the user can see the
   *  actual room while choosing what to keep. */
  photoUrl: string;
  items: RemovableObject[];
  /** The area the design will be built around, so the clear-list reads as
   *  purposeful rather than as a demand to tidy the house. */
  focalZone?: string;
  /** Called with the labels the user wants removed (empty = keep everything). */
  onComplete: (removeLabels: string[]) => void;
}

export default function TidyUpSelection({
  photoUrl,
  items,
  focalZone,
  onComplete,
}: TidyUpSelectionProps) {
  const suggested = new Set(recommendedClears(items));

  // Pre-cleared by default, and this is the whole point of the screen.
  //
  // It used to default to keep-everything, which sounds safe and produced the
  // worst outcome: a room the analysis had already flagged as "cluttered", with
  // eight removable objects listed, went through with nothing ticked — so the
  // empty-room pre-pass never ran and we rendered a birthday on top of a
  // ride-on toy, a bean bag and a pile of laundry. Suggesting the clear is the
  // difference between a design and a decorated mess. The user can still keep
  // anything with one tap.
  const [keep, setKeep] = useState<Set<string>>(
    () => new Set(items.filter((i) => !suggested.has(i.label)).map((i) => i.id))
  );

  const toggle = (id: string) => {
    setKeep((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const keepAll = () => setKeep(new Set(items.map((i) => i.id)));
  const removeAll = () => setKeep(new Set());

  const handleContinue = () => {
    const removeLabels = items
      .filter((i) => !keep.has(i.id))
      .map((i) => i.label);
    onComplete(removeLabels);
  };

  const labelById = new Map(items.map((i) => [i.id, i.label]));
  const removeCount = items.length - keep.size;

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Clear the way for the decorations
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          {focalZone ? (
            <>
              We&apos;ll build the design on{" "}
              <span className="text-zinc-700 dark:text-zinc-300">{focalZone}</span>.
              We&apos;ve pre-selected what&apos;s worth moving out of the way — check
              anything you&apos;d rather keep.
            </>
          ) : (
            <>
              We&apos;ve pre-selected what&apos;s worth moving out of the way before
              the event. Check anything you&apos;d rather keep exactly where it is.
            </>
          )}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Photo — shown prominently so the user can visualize the room */}
        <div className="md:sticky md:top-4 self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt="Your uploaded room"
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 object-contain bg-zinc-50 dark:bg-zinc-900 max-h-[420px]"
          />
        </div>

        {/* Item checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wide text-zinc-400">
              Checked items stay in the room
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={keepAll}
                className="text-xs px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                Keep all
              </button>
              <button
                type="button"
                onClick={removeAll}
                className="text-xs px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                Remove all
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {items.map((item) => {
              const isKeeping = keep.has(item.id);
              const restsOnLabel = item.restsOn
                ? labelById.get(item.restsOn)
                : undefined;
              return (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  aria-pressed={isKeeping}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-colors border ${
                    isKeeping
                      ? "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
                      : "border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                      isKeeping
                        ? "bg-orange-700 border-orange-700 text-white"
                        : "border-zinc-300 dark:border-zinc-600 text-transparent"
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`block text-sm ${
                          isKeeping
                            ? "text-zinc-800 dark:text-zinc-200"
                            : "line-through text-red-700 dark:text-red-400"
                        }`}
                      >
                        {item.label}
                      </span>
                      {item.blocksFocal && (
                        <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300">
                          <Sparkles size={9} />
                          in the way
                        </span>
                      )}
                      {item.effort === "heavy" && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          heavy
                        </span>
                      )}
                    </span>
                    {item.clearReason && !isKeeping && (
                      <span className="block text-[11px] text-zinc-500 mt-0.5">
                        {item.clearReason}
                      </span>
                    )}
                    {restsOnLabel && (
                      <span className="block text-[11px] text-zinc-400">
                        on the {restsOnLabel.toLowerCase()}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <button
        onClick={handleContinue}
        className="mt-6 w-full py-3 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 bg-orange-700 hover:bg-orange-800 text-white"
      >
        {removeCount > 0 ? (
          <>
            <Trash2 size={15} />
            Remove {removeCount} item{removeCount !== 1 ? "s" : ""} &amp; continue
          </>
        ) : (
          <>
            Keep everything &amp; continue
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}
