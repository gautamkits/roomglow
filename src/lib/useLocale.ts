"use client";

import { useMemo } from "react";
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
  return useMemo(() => {
    const locale = getClientLocale();
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
  }, []);
}
