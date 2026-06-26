"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Lock, Sparkles, LogIn, Check, ShieldCheck, Zap, Tag, X } from "lucide-react";
import { useLocale } from "@/lib/useLocale";

interface PaywallOverlayProps {
  designId: string | null;
  mode: "space" | "event";
  onUnlocked: () => void;
  itemCount?: number;
  narrative?: string;
  items?: string[];
}

interface Pricing {
  actualLabel: string;
  saleLabel: string;
  hasDiscount: boolean;
}

interface AppliedCoupon {
  code: string;
  finalLabel: string;
  discountLabel: string;
}

export default function PaywallOverlay({
  designId,
  mode,
  onUnlocked,
  itemCount = 0,
  narrative,
  items = [],
}: PaywallOverlayProps) {
  const { data: session, status } = useSession();
  const { locale, paymentEnabled } = useLocale();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimed = useRef(false);

  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [showCoupon, setShowCoupon] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [applying, setApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);

  const fallbackPrice = locale === "US" ? "$4.99" : "₹99";

  // Load current pricing for paid markets.
  useEffect(() => {
    if (!paymentEnabled) return;
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((d) =>
        setPricing({
          actualLabel: d.actualLabel,
          saleLabel: d.saleLabel,
          hasDiscount: d.hasDiscount,
        })
      )
      .catch(() => {});
  }, [paymentEnabled]);

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

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setApplying(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.valid) {
        setApplied({
          code: data.code,
          finalLabel: data.finalLabel,
          discountLabel: data.discountLabel,
        });
        setCouponError(null);
      } else {
        setApplied(null);
        setCouponError(data.message || "Invalid coupon");
      }
    } catch {
      setCouponError("Could not validate coupon");
    } finally {
      setApplying(false);
    }
  };

  const removeCoupon = () => {
    setApplied(null);
    setCouponInput("");
    setCouponError(null);
  };

  const handlePay = async () => {
    if (!designId) return;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, couponCode: applied?.code }),
      });
      const data = await res.json();

      // Admin / free-after-coupon
      if (data.free) {
        await fetch("/api/unlock-design", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designId }),
        }).catch(() => {});
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

  // Lead with the USP — every piece is shoppable with real prices & links.
  const shopLine =
    itemCount > 0
      ? `Every piece shoppable — all ${itemCount} with real prices & buy links`
      : "Every piece shoppable — real prices & buy links";

  const benefits =
    mode === "event"
      ? [
          shopLine,
          "Full decoration plan in high resolution",
          "Before & after comparison",
          "Download & save to your profile",
        ]
      : [
          shopLine,
          "Full-resolution redesigned room",
          "Before & after comparison slider",
          "Try unlimited style variations",
        ];

  // Effective displayed price
  const currentPrice = applied?.finalLabel || pricing?.saleLabel || fallbackPrice;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40">
      <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/70 to-white/40 dark:from-zinc-950/95 dark:via-zinc-950/70 dark:to-zinc-950/40" />

      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 w-[360px] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={22} className="text-orange-700" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Unlock your full design
          </h3>
          <p className="text-sm text-zinc-500 mt-1">
            {`Your ${mode === "event" ? "decoration plan" : "redesign"} is ready — here's everything you get.`}
          </p>
        </div>

        {/* The vision — builds desire before unlock */}
        {narrative && (
          <div className="mb-4 border-l-2 border-orange-700 pl-3 py-0.5">
            <p className="text-[13px] italic text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-4">
              {narrative}
            </p>
          </div>
        )}

        {/* Named pieces — concrete proof of what they get */}
        {items.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1.5">
              In this design
            </p>
            <div className="flex flex-wrap gap-1.5">
              {items.slice(0, 6).map((it) => (
                <span
                  key={it}
                  className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px]"
                >
                  {it}
                </span>
              ))}
              {items.length > 6 && (
                <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[11px]">
                  +{items.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* What you get */}
        <ul className="space-y-2.5 mb-5">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center shrink-0">
                <Check size={11} className="text-orange-700" strokeWidth={3} />
              </span>
              <span className="text-sm text-zinc-700 dark:text-zinc-300 leading-snug">
                {b}
              </span>
            </li>
          ))}
        </ul>

        {!isSignedIn ? (
          <>
            <button
              onClick={handleSignIn}
              className="w-full py-3 rounded-xl font-medium text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2"
            >
              <LogIn size={16} />
              Sign in with Google to continue
            </button>
            <p className="text-center text-xs text-zinc-400 mt-3">
              {paymentEnabled
                ? `Then unlock for ${pricing?.saleLabel || fallbackPrice} — one-time`
                : "Free · Saved to your profile"}
            </p>
          </>
        ) : (
          <>
            {/* Price row */}
            <div className="flex items-baseline justify-center gap-2 mb-3">
              {pricing?.hasDiscount && !applied && (
                <span className="text-sm text-zinc-400 line-through">
                  {pricing.actualLabel}
                </span>
              )}
              {applied && (
                <span className="text-sm text-zinc-400 line-through">
                  {pricing?.saleLabel || fallbackPrice}
                </span>
              )}
              <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                {currentPrice}
              </span>
            </div>

            {/* Coupon */}
            {applied ? (
              <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
                <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <Tag size={13} />
                  {applied.code} applied — {applied.discountLabel} off
                </span>
                <button
                  onClick={removeCoupon}
                  className="text-green-700 dark:text-green-400 hover:opacity-70"
                  aria-label="Remove coupon"
                >
                  <X size={14} />
                </button>
              </div>
            ) : showCoupon ? (
              <div className="mb-3">
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                    placeholder="Coupon code"
                    className="flex-1 px-3 py-2 rounded-lg text-sm border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors uppercase"
                  />
                  <button
                    onClick={applyCoupon}
                    disabled={applying || !couponInput.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 transition-colors disabled:opacity-50"
                  >
                    {applying ? "…" : "Apply"}
                  </button>
                </div>
                {couponError && (
                  <p className="text-xs text-red-600 mt-1.5">{couponError}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowCoupon(true)}
                className="flex items-center gap-1.5 mx-auto mb-3 text-xs text-orange-700 hover:text-orange-800 font-medium"
              >
                <Tag size={13} />
                Have a coupon?
              </button>
            )}

            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full py-3.5 rounded-xl font-semibold text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Lock size={16} />
              {paying ? "Opening checkout…" : `Unlock for ${currentPrice}`}
            </button>

            {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}

            {/* Trust signals */}
            <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <ShieldCheck size={13} /> Secure via Stripe
              </span>
              <span className="flex items-center gap-1">
                <Zap size={13} /> Instant access
              </span>
            </div>
            <p className="text-center text-[11px] text-zinc-400 mt-1.5">
              One-time payment · No subscription
            </p>
          </>
        )}
      </div>
    </div>
  );
}
