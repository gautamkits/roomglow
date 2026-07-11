"use client";

import { useState } from "react";
import { Check, ArrowRight, Trash2 } from "lucide-react";
import type { RemovableObject } from "@/lib/types";

interface TidyUpSelectionProps {
  /** The uploaded room/venue photo (data URL) — shown so the user can see the
   *  actual room while choosing what to remove. */
  photoUrl: string;
  items: RemovableObject[];
  /** Called with the labels the user wants removed (empty = keep everything). */
  onComplete: (removeLabels: string[]) => void;
}

export default function TidyUpSelection({
  photoUrl,
  items,
  onComplete,
}: TidyUpSelectionProps) {
  // Opt-in removal: nothing selected by default → we keep everything.
  const [remove, setRemove] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeAll = () => setRemove(new Set(items.map((i) => i.id)));
  const keepAll = () => setRemove(new Set());

  const handleContinue = () => {
    const labels = items.filter((i) => remove.has(i.id)).map((i) => i.label);
    onComplete(labels);
  };

  const count = remove.size;

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Anything you&apos;d like removed?
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          We&apos;ll keep everything unless you pick items to clear out. Removing
          clutter gives your new design a cleaner canvas.
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
              Detected in your room
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={removeAll}
                className="text-xs px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                Remove all
              </button>
              <button
                type="button"
                onClick={keepAll}
                className="text-xs px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                Keep all
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {items.map((item) => {
              const isRemoving = remove.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  aria-pressed={isRemoving}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-colors border ${
                    isRemoving
                      ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                      isRemoving
                        ? "bg-red-600 border-red-600 text-white"
                        : "border-zinc-300 dark:border-zinc-600 text-transparent"
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span
                    className={`text-sm ${
                      isRemoving
                        ? "line-through text-red-700 dark:text-red-400"
                        : "text-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    {item.label}
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
        {count > 0 ? (
          <>
            <Trash2 size={15} />
            Remove {count} item{count !== 1 ? "s" : ""} &amp; continue
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
