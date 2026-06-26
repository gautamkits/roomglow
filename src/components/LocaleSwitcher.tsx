"use client";

import { useEffect, useState } from "react";
import { getClientLocale, type Locale } from "@/lib/locale";

const FLAGS: Record<Locale, string> = { IN: "🇮🇳", US: "🇺🇸" };
const LABELS: Record<Locale, string> = { IN: "IN", US: "US" };

export default function LocaleSwitcher() {
  const [locale, setLocale] = useState<Locale>("IN");

  useEffect(() => {
    setLocale(getClientLocale());
  }, []);

  const toggle = () => {
    const next: Locale = locale === "IN" ? "US" : "IN";
    document.cookie = `noosho-locale=${next}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    setLocale(next);
    // Reload so the server-side locale (Amazon search) picks it up too
    window.location.reload();
  };

  return (
    <button
      onClick={toggle}
      title="Switch marketplace"
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      <span>{FLAGS[locale]}</span>
      <span className="hidden sm:inline">{LABELS[locale]}</span>
    </button>
  );
}
