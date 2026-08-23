"use client";

import { useState } from "react";

/**
 * Three-face verdict on a finished design, plus a "what was off?" box that only
 * appears for a low rating.
 *
 * The reason box is the point of the whole widget — a bare score tells you
 * something is wrong without telling you what, and this is the one moment the
 * user is still looking at the design and can say why. It stays optional so a
 * tap is never held hostage to typing.
 *
 * Renders only for entitled viewers (the caller gates on unlock): asking someone
 * to rate a blurred paywalled preview would measure the paywall, not the design.
 */

type Rating = "happy" | "ok" | "sad";

const FACES: { id: Rating; face: string; label: string }[] = [
  { id: "sad", face: "😞", label: "Not great" },
  { id: "ok", face: "😐", label: "It's okay" },
  { id: "happy", face: "😍", label: "Love it" },
];

export default function DesignFeedback({ designId }: { designId: string }) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);
  const [reasonSent, setReasonSent] = useState(false);

  const post = async (r: Rating, why?: string) => {
    try {
      await fetch("/api/design-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, rating: r, reason: why ?? "" }),
      });
    } catch {
      /* feedback must never surface an error over the user's design */
    }
  };

  const pick = (r: Rating) => {
    setRating(r);
    setSent(true);
    void post(r);
  };

  const submitReason = () => {
    if (!rating || !reason.trim()) return;
    setReasonSent(true);
    void post(rating, reason.trim());
  };

  const low = rating === "sad" || rating === "ok";

  return (
    <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800 animate-fade-up">
      <p className="text-center text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
        {sent ? "Thanks — that helps." : "How's this design?"}
      </p>

      <div className="flex items-center justify-center gap-2.5">
        {FACES.map((f) => (
          <button
            key={f.id}
            onClick={() => pick(f.id)}
            aria-label={f.label}
            aria-pressed={rating === f.id}
            className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl border transition-colors ${
              rating === f.id
                ? "border-orange-700 bg-orange-50 dark:bg-orange-950/30"
                : "border-zinc-200 dark:border-zinc-800 hover:border-orange-700"
            }`}
          >
            <span className="text-2xl leading-none">{f.face}</span>
            <span className="text-[11px] text-zinc-500">{f.label}</span>
          </button>
        ))}
      </div>

      {low && !reasonSent && (
        <div className="mt-4 max-w-md mx-auto animate-fade-up">
          <label
            htmlFor="feedback-reason"
            className="block text-xs text-zinc-500 mb-1.5 text-center"
          >
            What was off? This goes straight to us.
          </label>
          <div className="flex gap-2">
            <input
              id="feedback-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitReason()}
              maxLength={500}
              placeholder="e.g. the backdrop didn't match my theme"
              className="flex-1 px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors"
            />
            <button
              onClick={submitReason}
              disabled={!reason.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 transition-opacity"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {reasonSent && (
        <p className="mt-3 text-center text-xs text-zinc-500">
          Sent — we read every one of these.
        </p>
      )}
    </div>
  );
}
