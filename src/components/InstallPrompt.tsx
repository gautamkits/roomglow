"use client";

import { useEffect, useState } from "react";
import { Smartphone, Download, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "noosho-a2hs-dismissed";

/**
 * Post-unlock "Add to home screen" nudge. Chrome/Android: captures
 * beforeinstallprompt and triggers the native install dialog. iOS Safari
 * (no install API): shows Share → Add to Home Screen instructions.
 * Hidden when already installed or previously dismissed.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(true); // assume hidden until checked

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      return;
    }
    // Already running as an installed app → nothing to ask.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes navigator.standalone
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    setDismissed(false);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS has no beforeinstallprompt — show the manual instructions instead.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos) setShowIos(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setDismissed(true);
    setDeferred(null);
  };

  if (dismissed || (!deferred && !showIos)) return null;

  return (
    <div className="mt-6 mx-auto max-w-md animate-fade-up">
      <div className="relative flex items-center gap-3 rounded-xl border border-orange-200/70 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 px-4 py-3">
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
        >
          <X size={14} />
        </button>
        <span className="w-9 h-9 rounded-lg bg-orange-700 flex items-center justify-center shrink-0">
          <Smartphone size={17} className="text-white" />
        </span>
        <div className="min-w-0 pr-4">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Keep Noosho on your home screen
          </p>
          {deferred ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Jump back to your designs anytime.
            </p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1 flex-wrap">
              Tap <Share size={12} className="inline shrink-0" /> Share, then
              &ldquo;Add to Home Screen&rdquo;.
            </p>
          )}
        </div>
        {deferred && (
          <button
            onClick={install}
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-medium transition-colors"
          >
            <Download size={13} />
            Install
          </button>
        )}
      </div>
    </div>
  );
}
