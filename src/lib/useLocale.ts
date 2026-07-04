"use client";

import { useEffect, useState } from "react";
import { getClientLocale, PAYMENT_ENABLED, type Locale } from "@/lib/locale";

export interface LocaleConfig {
  locale: Locale;
  currency: string;       // "₹" or "$"
  paymentEnabled: boolean;
  budgetMin: number;
  budgetMax: number;
  budgetStep: number;
  formatBudget: (n: number) => string;
}

export function useLocale(): LocaleConfig {
  // Start from the SSR default ("IN") so the first client render matches the
  // server-rendered HTML, then correct to the cookie locale after mount. Reading
  // the cookie during render (SSR = "IN", client = actual) caused a hydration
  // mismatch on locale-dependent output (currency, budget).
  const [locale, setLocale] = useState<Locale>("IN");
  useEffect(() => setLocale(getClientLocale()), []);

  const isUS = locale === "US";
  return {
    locale,
    currency: isUS ? "$" : "₹",
    paymentEnabled: PAYMENT_ENABLED[locale],
    budgetMin: isUS ? 100 : 1000,
    budgetMax: isUS ? 2000 : 25000,
    budgetStep: isUS ? 50 : 500,
    formatBudget: (n: number) =>
      isUS
        ? `$${n.toLocaleString("en-US")}`
        : `₹${n.toLocaleString("en-IN")}`,
  };
}
