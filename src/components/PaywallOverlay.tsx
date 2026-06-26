"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Lock, Sparkles, LogIn } from "lucide-react";
import { useLocale } from "@/lib/useLocale";

interface PaywallOverlayProps {
  designId: string | null;
  mode: "space" | "event";
  onUnlocked: () => void;
}

export default function PaywallOverlay({ designId, mode, onUnlocked }: PaywallOverlayProps) {
  const { data: session, status } = useSession();
  const { locale, paymentEnabled } = useLocale();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimed = useRef(false);

  const price = locale === "US" ? "$4.99" : "₹99";

  // Free markets (no payment): once signed in, claim + reveal automatically.
  useEffect(() => {
    if (paymentEnabled) return;
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
  }, [status, session, designId, paymentEnabled, onUnlocked]);

  const handleSignIn = () => {
    signIn("google", {
      callbackUrl: designId ? `/design/${designId}` : "/create",
    });
  };

  const handlePay = async () => {
    if (!designId) return;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId }),
      });
      const data = await res.json();

      // Admin free-pass
      if (data.free) {
        await fetch("/api/unlock-design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designId }),
        });
        onUnlocked();
        return;
      }

      if (!res.ok || !data.url) {
        setError(data.error || "Could not start checkout. Try again.");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const isSignedIn = status === "authenticated" && !!session;

  // Loading session, or a free-market signed-in user mid-claim → spinner.
  if (status === "loading" || (!paymentEnabled && isSignedIn)) {
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
            ? "Unlock the full decoration plan with shoppable product links."
            : "Unlock the redesigned room with shoppable product links."}
        </p>

        {!isSignedIn ? (
          <>
            <button
              onClick={handleSignIn}
              className="w-full py-3 rounded-lg font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2 mb-3"
            >
              <LogIn size={16} />
              Sign in with Google
            </button>
            <p className="text-xs text-zinc-400">
              Sign in to pay and unlock your design
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-4 text-sm text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Signed in as {session.user?.name?.split(" ")[0]}
            </div>

            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full py-3 rounded-lg font-semibold text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Lock size={16} />
              {paying ? "Opening checkout…" : `Unlock for ${price}`}
            </button>

            {error && (
              <p className="text-xs text-red-600 mt-2">{error}</p>
            )}

            <p className="text-xs text-zinc-400 mt-3">
              Secure payment via Stripe · One-time
            </p>
          </>
        )}
      </div>
    </div>
  );
}
