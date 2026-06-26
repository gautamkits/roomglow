import Stripe from "stripe";
import type { Locale } from "@/lib/locale";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-06-24.dahlia",
});

export const STRIPE_PRICES: Record<Locale, { amount: number; currency: string; label: string }> = {
  IN: { amount: 9900, currency: "inr", label: "₹99" },
  US: { amount: 499,  currency: "usd", label: "$4.99" },
};
