// "Book a decorator" waitlist service config.
//
// This is a demand-validation MVP: we advertise a physical decoration-build
// service on event designs (India only) and collect waitlist leads. Pricing is
// a single constant here — NOT the DB-driven `pricing` table used for design
// unlocks — so it's trivial to tweak. Money is in minor units (paise) per the
// repo convention; render with formatAmount(amount, currency).
export const DECOR_SERVICE = {
  priceMinor: 99900, // ₹999
  currency: "inr",
  durationLabel: "2 hours",
} as const;
