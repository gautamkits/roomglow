"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import {
  Lock,
  LogIn,
  ShieldCheck,
  Zap,
  Tag,
  X,
  ShoppingBag,
  Download,
  ArrowLeftRight,
  Wand2,
  PartyPopper,
  Bookmark,
} from "lucide-react";
import { useLocale } from "@/lib/useLocale";

interface PaywallOverlayProps {
  designId: string | null;
  mode: "space" | "event" | "makeover";
  onUnlocked: () => void;
  itemCount?: number;
  narrative?: string;
  items?: string[];
  imageUrl?: string;
}

interface Pricing {
  actualLabel: string;
  saleLabel: string;
  hasDiscount: boolean;
  savingsPct: number;
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
          savingsPct:
            d.hasDiscount && d.actualAmount > 0
              ? Math.round((1 - d.saleAmount / d.actualAmount) * 100)
              : 0,
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

  const applyCoupon = async (codeArg?: string) => {
    const code = (codeArg ?? couponInput).trim();
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

  // Auto-apply a coupon passed via the email link (?coupon=DESIGN20).
  const autoCoupon = useRef(false);
  useEffect(() => {
    if (!paymentEnabled || autoCoupon.current) return;
    const code = new URLSearchParams(window.location.search).get("coupon");
    if (!code) return;
    autoCoupon.current = true;
    setCouponInput(code.toUpperCase());
    setShowCoupon(true);
    applyCoupon(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentEnabled]);

  const removeCoupon = () => {
    setApplied(null);
    setCouponInput("");
    setCouponError(null);
  };

  const handlePayRazorpay = async () => {
    if (!designId) return;
    setPaying(true);
    setError(null);
    try {
      const orderRes = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, couponCode: applied?.code }),
      });
      const orderData = await orderRes.json();

      if (orderData.free) {
        onUnlocked();
        return;
      }

      if (!orderRes.ok || !orderData.orderId) {
        setError(orderData.error || "Could not start checkout. Try again.");
        return;
      }

      // Load Razorpay checkout script dynamically
      await new Promise<void>((resolve, reject) => {
        if ((window as { Razorpay?: unknown }).Razorpay) { resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay"));
        document.body.appendChild(script);
      });

      await new Promise<void>((resolve, reject) => {
        const rzp = new (window as unknown as { Razorpay: new (opts: unknown) => { open(): void; on(e: string, cb: () => void): void } }).Razorpay({
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency,
          order_id: orderData.orderId,
          name: "Noosho",
          description: "Design unlock",
          theme: { color: "#f41c5e" },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verifyRes = await fetch("/api/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  designId,
                  couponCode: orderData.couponCode,
                  amount: orderData.amount,
                  currency: orderData.currency,
                }),
              });
              if (verifyRes.ok) {
                resolve();
              } else {
                const d = await verifyRes.json();
                reject(new Error(d.error || "Verification failed"));
              }
            } catch (e) {
              reject(e);
            }
          },
        });
        rzp.on("payment.failed", () => reject(new Error("Payment failed or cancelled")));
        rzp.open();
      });

      onUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const handlePay = async () => {
    if (locale === "IN") return handlePayRazorpay();
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

  // Detailed value stack — lead with the USP (every piece is shoppable).
  const isEvent = mode === "event";
  const benefits: { icon: typeof ShoppingBag; label: string; detail: string }[] = [
    {
      icon: ShoppingBag,
      label: itemCount > 0 ? `Shop all ${itemCount} pieces` : "Shop every piece",
      detail: "Live Amazon prices + one-tap buy links for each item",
    },
    {
      icon: isEvent ? PartyPopper : Download,
      label: isEvent ? "Full decoration plan" : "Full-resolution design",
      detail: isEvent
        ? "The complete styled venue in high resolution"
        : "Download & keep the HD redesign of your room",
    },
    {
      icon: ArrowLeftRight,
      label: "Before & after",
      detail: "Compare your original space with the new look",
    },
    isEvent
      ? {
          icon: Bookmark,
          label: "Saved to your profile",
          detail: "Revisit your event design anytime",
        }
      : {
          icon: Wand2,
          label: "5 free restyles",
          detail: "Re-render this room in other styles — Modern, Boho & more",
        },
  ];

  // Effective displayed price
  const currentPrice = applied?.finalLabel || pricing?.saleLabel || fallbackPrice;

  return (
    <div className="absolute inset-0 z-40">
      {/* Frosted layer over the whole blurred design — it glows through */}
      <div className="absolute inset-0 bg-white/70 dark:bg-zinc-950/75 backdrop-blur-xl" />

      {/* Full-area content — no inner card, no scrollbar */}
      <div className="absolute inset-0 flex justify-center items-start sm:items-center overflow-y-auto px-5 py-7 sm:px-10 sm:py-10">
        <div className="w-full max-w-3xl grid gap-y-6 gap-x-12 sm:grid-cols-2 sm:items-center">
          {/* ── Left: the dream ── */}
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-orange-800 dark:text-orange-300 bg-orange-50/90 dark:bg-orange-950/50 px-2.5 py-1 rounded-full mb-3">
              <Lock size={11} /> {isEvent ? "Event design locked" : "Design locked"}
            </span>
            <h3 className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight leading-tight text-zinc-900 dark:text-zinc-50">
              {isEvent ? "Unlock your event design" : "Unlock your full design"}
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-2">
              Not just a picture — the exact pieces to make it real.
            </p>

            {narrative && (
              <div className="mt-4 border-l-2 border-orange-700 pl-3.5">
                <p className="text-[13px] italic text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3 sm:line-clamp-5">
                  {narrative}
                </p>
              </div>
            )}

            {items.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {items.slice(0, 6).map((it) => (
                  <span
                    key={it}
                    className="px-2.5 py-1 rounded-full bg-white/70 dark:bg-zinc-800/70 text-zinc-700 dark:text-zinc-300 text-[11px]"
                  >
                    {it}
                  </span>
                ))}
                {items.length > 6 && (
                  <span className="px-2.5 py-1 rounded-full bg-white/70 dark:bg-zinc-800/70 text-zinc-500 text-[11px]">
                    +{items.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Right: value + offer ── */}
          <div>
            <ul className="space-y-3 mb-5">
              {benefits.map((b) => {
                const Icon = b.icon;
                return (
                  <li key={b.label} className="flex items-start gap-3">
                    <span className="mt-0.5 w-8 h-8 rounded-lg bg-orange-50/90 dark:bg-orange-950/50 flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-orange-700" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-tight">
                        {b.label}
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-snug mt-0.5">
                        {b.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {!isSignedIn ? (
              <>
                <button
                  onClick={handleSignIn}
                  className="w-full py-3.5 rounded-xl font-semibold text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <LogIn size={16} />
                  Sign in with Google to continue
                </button>
                <p className="text-center text-xs text-zinc-500 mt-3">
                  {paymentEnabled
                    ? `Then unlock for ${pricing?.saleLabel || fallbackPrice} — one-time`
                    : "Free · Saved to your profile"}
                </p>
              </>
            ) : (
              <>
                {/* Price row */}
                <div className="flex items-center gap-2 mb-3">
                  {pricing?.hasDiscount && !applied && (
                    <span className="text-base text-zinc-400 line-through">
                      {pricing.actualLabel}
                    </span>
                  )}
                  {applied && (
                    <span className="text-base text-zinc-400 line-through">
                      {pricing?.saleLabel || fallbackPrice}
                    </span>
                  )}
                  <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                    {currentPrice}
                  </span>
                  {!applied && pricing?.hasDiscount && pricing.savingsPct > 0 && (
                    <span className="ml-auto text-[11px] font-semibold text-green-700 bg-green-50 dark:bg-green-950/40 dark:text-green-400 px-2 py-1 rounded-full">
                      Save {pricing.savingsPct}%
                    </span>
                  )}
                </div>

                {/* Coupon */}
                {applied ? (
                  <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                      <Tag size={13} />
                      {applied.code} — {applied.discountLabel} off
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
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none focus:border-orange-700 transition-colors uppercase"
                      />
                      <button
                        onClick={() => applyCoupon()}
                        disabled={applying || !couponInput.trim()}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-white/80 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
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
                    className="flex items-center gap-1.5 mb-3 text-xs text-orange-700 hover:text-orange-800 font-medium"
                  >
                    <Tag size={13} />
                    Have a coupon?
                  </button>
                )}

                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="w-full py-3.5 rounded-xl font-semibold text-white bg-orange-700 hover:bg-orange-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-md"
                >
                  <Lock size={16} />
                  {paying ? "Opening checkout…" : `Unlock for ${currentPrice}`}
                </button>

                {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}

                {/* Trust signals */}
                <div className="flex items-center justify-center gap-3 mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={13} /> Secure via {locale === "IN" ? "Razorpay" : "Stripe"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap size={13} /> Instant access
                  </span>
                  <span>One-time</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
