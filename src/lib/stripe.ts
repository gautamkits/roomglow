import Stripe from "stripe";
import type { Locale } from "@/lib/locale";

// Lazily construct the Stripe client. Building it at module scope crashes any
// import of this file (and the production build's page-data collection) when
// STRIPE_SECRET_KEY is absent; deferring it means we only fail if a Stripe call
// is actually made without configuration.
let _stripe: Stripe | null = null;
function client(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const c = client();
    const value = (c as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
}) as Stripe;

export const STRIPE_PRICES: Record<Locale, { amount: number; currency: string; label: string }> = {
  IN: { amount: 9900, currency: "inr", label: "₹99" },
  US: { amount: 499,  currency: "usd", label: "$4.99" },
};
