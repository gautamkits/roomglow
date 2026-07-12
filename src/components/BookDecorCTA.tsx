"use client";

import { useState } from "react";
import { Sparkles, Clock, CheckCircle2 } from "lucide-react";
import { useLocale } from "@/lib/useLocale";
import { formatAmount } from "@/lib/locale";
import { DECOR_SERVICE } from "@/lib/decor";

interface BookDecorCTAProps {
  designId?: string | null;
  eventLabel: string;
}

// Post-unlock "book a decorator" waitlist CTA for EVENT designs, India only.
// FOMO framing: we tell the user upfront we're already fully booked at their
// location, then offer the waitlist. Captures a lead via /api/decor-leads (which
// re-enforces IN-only server-side). Renders nothing outside India.
export default function BookDecorCTA({ designId, eventLabel }: BookDecorCTAProps) {
  const { locale } = useLocale();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // India-only. Server route is the source of truth; this hides the UI for US.
  if (locale !== "IN") return null;

  const price = formatAmount(DECOR_SERVICE.priceMinor, DECOR_SERVICE.currency);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setError(null);
    setStatus("sending");
    try {
      const res = await fetch("/api/decor-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, eventLabel, email, phone, eventDate, city, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't join right now. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError("Couldn't join right now. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <div className="mt-10 animate-fade-up-delay-2">
      <div className="rounded-2xl border border-[#ece7e0] dark:border-zinc-800 bg-[#faf6f0] dark:bg-zinc-900 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-orange-700" />
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Want this decoration built for real?
          </h3>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
          Our decorators near you are <span className="font-medium">fully booked</span> this
          season — join the waitlist and we&apos;ll reach out as slots open.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-sm">
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{price}</span>
          <span className="flex items-center gap-1 text-zinc-500">
            <Clock size={13} />
            {DECOR_SERVICE.durationLabel} on-site session
          </span>
        </div>

        {status === "done" ? (
          <div className="flex items-start gap-2 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-white dark:bg-zinc-950 p-4">
            <CheckCircle2 size={18} className="text-orange-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                You&apos;re on the waitlist 🎉
              </p>
              <p className="text-sm text-zinc-500">
                Slots are limited — we&apos;ll reach out the moment a decorator opens up near you.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2.5">
            {/* Honeypot — hidden from users, bots fill it. */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="hidden"
              aria-hidden="true"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address *"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-700/40"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-700/40"
              />
              <input
                type="text"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                placeholder="Event date (optional)"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-700/40"
              />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City (optional)"
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-700/40"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-orange-700 hover:bg-orange-800 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {status === "sending" ? "Joining…" : "Join the waitlist"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
