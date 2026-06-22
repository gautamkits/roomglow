"use client";

import { Check, Sparkles } from "lucide-react";

interface ProcessingViewProps {
  image: string | null;
  step: "analyzing" | "generating" | "curating";
  isEvent: boolean;
  statusMessage?: string;
}

export default function ProcessingView({
  image,
  step,
  isEvent,
  statusMessage,
}: ProcessingViewProps) {
  const loadingIndex =
    step === "analyzing" ? 0 : step === "generating" ? 1 : 2;

  const headline =
    step === "analyzing"
      ? isEvent
        ? "Studying your venue"
        : "Studying your space"
      : step === "generating"
        ? isEvent
          ? "Designing the decorations"
          : "Designing your room"
        : "Hand-picking the products";

  const labels = isEvent
    ? ["Understanding", "Planning", "Sourcing", "Staging"]
    : ["Understanding", "Designing", "Sourcing", "Rendering"];

  return (
    <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-1">
      <div className="w-full max-w-md">
        {/* Scanning image */}
        <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-lg aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
          {image ? (
            <img
              src={image}
              alt="Your uploaded room"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full" />
          )}

          {/* dark veil */}
          <div className="absolute inset-0 bg-zinc-900/30" />

          {/* scan line sweep */}
          <div className="absolute inset-0 scan-sweep" />

          {/* grid shimmer */}
          <div className="absolute inset-0 scan-grid opacity-40" />

          {/* center badge */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shadow-lg">
              <Sparkles size={15} className="text-orange-700 animate-pulse" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {headline}
              </span>
            </div>
          </div>
        </div>

        {/* progress bar */}
        <div className="relative h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden progress-bar mt-6 mb-5" />

        {/* stepper */}
        <div className="flex items-center justify-between">
          {labels.map((label, i) => {
            const done = i < loadingIndex;
            const active = i === loadingIndex;
            return (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors ${
                    done
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                      : active
                        ? "bg-orange-700 text-white"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                </div>
                <span
                  className={`text-[11px] ${
                    active
                      ? "text-zinc-900 dark:text-zinc-100 font-medium"
                      : "text-zinc-400"
                  }`}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {statusMessage && (
          <p className="text-sm text-zinc-500 text-center mt-6">
            {statusMessage}
          </p>
        )}
      </div>
    </div>
  );
}
