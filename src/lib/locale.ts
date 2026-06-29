export type Locale = "IN" | "US";

export const AFFILIATE_TAGS: Record<Locale, string> = {
  IN: process.env.AMAZON_PARTNER_TAG || "yuaid-21",
  US: process.env.AMAZON_US_PARTNER_TAG || "yuaid01-20",
};

export const AMAZON_DOMAINS: Record<Locale, string> = {
  IN: "amazon.in",
  US: "amazon.com",
};

export const CURRENCY_SYMBOLS: Record<Locale, string> = {
  IN: "₹",
  US: "$",
};

export const PAYMENT_ENABLED: Record<Locale, boolean> = {
  IN: true,
  US: true,
};

/** Read locale from the noosho-locale cookie string (works in server components / API routes). */
export function localeFromCookieHeader(cookieHeader: string | null): Locale {
  if (!cookieHeader) return "IN";
  const match = cookieHeader.match(/noosho-locale=([^;]+)/);
  const val = match?.[1];
  return val === "US" ? "US" : "IN";
}

/** Read locale from a Next.js Request object. */
export function localeFromRequest(request: Request): Locale {
  // 1. Cookie (set by middleware, most reliable)
  const cookie = request.headers.get("cookie");
  if (cookie) {
    const m = cookie.match(/noosho-locale=([^;]+)/);
    if (m?.[1] === "US") return "US";
    if (m?.[1] === "IN") return "IN";
  }
  // 2. Fallback to Vercel geo header
  const country = request.headers.get("x-vercel-ip-country");
  return country === "US" ? "US" : "IN";
}

export function affiliateUrl(asin: string, locale: Locale): string {
  return `https://www.${AMAZON_DOMAINS[locale]}/dp/${asin}?tag=${AFFILIATE_TAGS[locale]}`;
}

/** Format an amount in the smallest currency unit (paise/cents) for display. */
export function formatAmount(amount: number, currency: string): string {
  if (currency === "usd") return `$${(amount / 100).toFixed(2)}`;
  return `₹${Math.round(amount / 100).toLocaleString("en-IN")}`;
}

/** Client-side: read locale cookie from document.cookie */
export function getClientLocale(): Locale {
  if (typeof document === "undefined") return "IN";
  const m = document.cookie.match(/noosho-locale=([^;]+)/);
  return m?.[1] === "US" ? "US" : "IN";
}
