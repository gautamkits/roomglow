// Smart budget from real Amazon prices.
//
// The design image is rendered from whatever products curation picks, so a
// budget that's below what the design actually costs starves the render and the
// room looks sparse. To prevent that we derive a price range from the real
// candidate prices returned by /api/search-products and floor the user's budget
// at the cheapest coherent full set — the minimum needed to realize the look at
// all. If the user gave no budget, we default to the "typical" set.

interface Candidate {
  price?: string;
}
export interface SearchCategory {
  candidates?: Candidate[];
}

export interface BudgetBands {
  /** Σ cheapest priced candidate per category — cheapest way to buy the whole look. */
  min: number;
  /** Σ median priced candidate per category — a balanced, good-looking set. */
  typical: number;
  /** Σ most expensive priced candidate per category — the premium look. */
  max: number;
  /** Currency symbol pulled from the product prices ("₹", "$"). */
  currency: string;
}

export function parsePrice(s?: string): number {
  if (!s) return 0;
  const v = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isNaN(v) ? 0 : v;
}

function currencySymbolOf(categories: SearchCategory[]): string {
  for (const cat of categories) {
    for (const c of cat.candidates || []) {
      const m = c.price?.match(/[^\d.,\s]+/);
      if (m) return m[0];
    }
  }
  return "₹";
}

/** Derive min / typical / max spend from the real candidate prices per category.
 *  Categories with no priced candidates are skipped so a missing price never
 *  understates the floor. Returns null when nothing is priced. */
export function computeBudgetBands(categories: SearchCategory[]): BudgetBands | null {
  let min = 0;
  let typical = 0;
  let max = 0;
  let priced = 0;

  for (const cat of categories) {
    const prices = (cat.candidates || [])
      .map((c) => parsePrice(c.price))
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    if (prices.length === 0) continue;
    priced++;
    min += prices[0];
    max += prices[prices.length - 1];
    typical += prices[Math.floor((prices.length - 1) / 2)]; // median
  }

  if (priced === 0) return null;
  return { min, typical, max, currency: currencySymbolOf(categories) };
}

/** Effective budget passed to curation: the user's cap, but never below the
 *  cheapest full set; falls back to the typical set when the user gave none. */
export function effectiveBudget(
  userBudget: number | undefined,
  bands: BudgetBands
): number {
  const base = userBudget && userBudget > 0 ? userBudget : bands.typical;
  return Math.max(base, bands.min);
}

/** Budget instruction for the curation prompt, floored at the real minimum and
 *  formatted in the products' own currency. Returns undefined when there's
 *  nothing to constrain (no prices and no user budget). */
export function smartBudgetInstruction(
  userBudget: number | undefined,
  categories: SearchCategory[]
): string | undefined {
  const bands = computeBudgetBands(categories);
  if (!bands) {
    // No real prices to reason about — fall back to the user's cap if any.
    if (!userBudget || userBudget <= 0) return undefined;
    return budgetSentence(userBudget, "₹");
  }
  return budgetSentence(effectiveBudget(userBudget, bands), bands.currency);
}

function budgetSentence(amount: number, currency: string): string {
  const formatted =
    currency + Math.round(amount).toLocaleString(currency === "$" ? "en-US" : "en-IN");
  return `BUDGET CONSTRAINT: Keep the COMBINED total of all chosen products at or under ${formatted}. Prefer cheaper suitable options to stay within budget while keeping the design cohesive and complete. Only exceed the cap for a category if it has no cheaper viable option.`;
}
