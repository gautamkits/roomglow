"use client";

import { useEffect, useRef } from "react";
import { signIn, useSession } from "next-auth/react";
import { Lock, Sparkles } from "lucide-react";

interface PaywallOverlayProps {
  designId: string | null;
  price: number;
  mode: "space" | "event";
  onUnlocked: () => void;
}

export default function PaywallOverlay({
  designId,
  mode,
  onUnlocked,
}: PaywallOverlayProps) {
  const { data: session, status } = useSession();
  const claimed = useRef(false);

  // If the user is already signed in (e.g. signed in via the header before
  // the design saved), claim the design in the DB then reveal it.
  useEffect(() => {
    if (status !== "authenticated" || !session || claimed.current) return;
    claimed.current = true;

    (async () => {
      if (designId) {
        try {
          await fetch("/api/unlock-design", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ designId }),
          });
        } catch {}
      }
      onUnlocked();
    })();
  }, [status, session, designId, onUnlocked]);

  const handleSignIn = () => {
    // After Google auth, land on the design page which claims + shows it.
    signIn("google", {
      callbackUrl: designId ? `/design/${designId}` : "/",
    });
  };

  if (status === "loading" || (status === "authenticated" && session)) {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-40">
        <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/60 to-white/30 dark:from-zinc-950/95 dark:via-zinc-950/60 dark:to-zinc-950/30" />
        <div className="relative w-8 h-8 border-2 border-orange-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40">
      <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/60 to-white/30 dark:from-zinc-950/95 dark:via-zinc-950/60 dark:to-zinc-950/30" />

      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-6 max-w-sm mx-4 text-center">
        <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-4">
          <Sparkles size={24} className="text-orange-700" />
        </div>

        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          Your design is ready
        </h3>
        <p className="text-sm text-zinc-500 mb-5">
          {mode === "event"
            ? "Sign in to reveal the full decoration plan with buy links — and save it to your account."
            : "Sign in to reveal the redesigned room with buy links — and save it to your account."}
        </p>

        <button
          onClick={handleSignIn}
          className="w-full py-3 rounded-lg font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2"
        >
          <Lock size={16} />
          Sign in with Google to unlock
        </button>

        <p className="text-xs text-zinc-400 mt-3">
          Free · Your designs are saved to your profile
        </p>
      </div>
    </div>
  );
}
