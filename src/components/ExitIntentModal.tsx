"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mail, Check, X, Sparkles } from "lucide-react";
import { useExitIntent, silenceExitIntent, type ExitTrigger } from "@/hooks/useExitIntent";
import { track } from "@/lib/analytics";

/**
 * Last-chance email capture shown when a visitor moves to leave.
 *
 * Posts to the same magic-link endpoint as the sign-in gate, so a captured
 * address is both a retargetable lead and a working passwordless sign-in — and
 * it costs nothing to serve (no render is triggered pre-auth).
 */
export default function ExitIntentModal({
  enabled = true,
  context,
  callbackUrl = "/create?resume=1",
}: {
  enabled?: boolean;
  context: "home" | "create";
  callbackUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onTrigger = useCallback(
    (trigger: ExitTrigger) => {
      setOpen(true);
      track("exit_intent_shown", { context, trigger });
    },
    [context]
  );

  useExitIntent(enabled, onTrigger);

  const close = useCallback(() => {
    setOpen(false);
    silenceExitIntent();
    if (state !== "sent") track("exit_intent_dismissed", { context });
  }, [context, state]);

  // Focus the field and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, callbackUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setState("sent");
        silenceExitIntent();
        track("exit_intent_email_submitted", { context }, { meta: true });
      } else {
        setError(data.error || "Couldn't send the link. Please try again.");
        setState("error");
      }
    } catch {
      setError("Couldn't send the link. Please try again.");
      setState("error");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-fade-up"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-intent-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl"
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          <X size={16} />
        </button>

        {state === "sent" ? (
          <div className="text-center py-2">
            <div className="w-11 h-11 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-3">
              <Check size={20} className="text-green-700 dark:text-green-400" />
            </div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Check your inbox
            </p>
            <p className="text-sm text-zinc-500 mt-1.5">
              We sent your link to <span className="font-medium">{email}</span>.
              It expires in 15 minutes.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-4 text-sm text-zinc-500 hover:text-orange-700 transition-colors"
            >
              Keep looking around
            </button>
          </div>
        ) : (
          <>
            <span className="w-10 h-10 rounded-xl bg-orange-700 flex items-center justify-center mb-3">
              <Sparkles size={18} className="text-white" />
            </span>
            <h2
              id="exit-intent-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 font-[family-name:var(--font-sora)]"
            >
              Wait — your free design is still here.
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">
              The first 500 signups get their first design free. Send yourself a
              link and pick it up whenever you&apos;ve got a photo handy.
            </p>

            <form onSubmit={submit} className="mt-4 space-y-2">
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full pl-8 pr-3 py-3 rounded-xl text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={state === "sending"}
                className="w-full px-4 py-3 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors disabled:opacity-50"
              >
                {state === "sending" ? "Sending…" : "See my design"}
              </button>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </form>

            <p className="text-[11px] text-zinc-400 text-center mt-3">
              No spam. One link, and it signs you in.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
