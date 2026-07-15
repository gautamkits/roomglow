import type { Locale } from "@/lib/locale";

export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  subThemes: string[];
  colorSchemes: string[];
  markets: Locale[]; // which marketplaces show this event
  gendered?: boolean; // show the boy/girl/neutral picker (child-centric events)
  // One-off life events (not annually recurring). Excluded from the recurring
  // "Upcoming events" reminders — see isOneTimeEvent / UpcomingEvents.
  oneTime?: boolean;
  // Approximate calendar anchor (month 1-12, day) for seasonal festivals. Its
  // presence means the event is only offered when its next occurrence is within
  // LEAD_MONTHS (see getEvents / isSeasonalEventNear). Events WITHOUT a season
  // are evergreen (birthdays, anniversaries, life events) and always shown.
  // For movable festivals (Holi, Diwali, Eid…) this is a representative date
  // used only for visibility gating — the actual reminder date is whatever the
  // user picks in SetupPanel.
  season?: { month: number; day: number };
  // Relationship festivals (Raksha Bandhan, Valentine's) are calendar events but
  // are centered on a person, so they still ask "who's it for?" — but not a date
  // (that's set by the calendar). Personal events imply this via `!season`.
  askHonoree?: boolean;
  // Occasion-specific buyables (beyond décor) for the "Complete the occasion"
  // grid — gifts, treats, tableware, etc. Each is a plain Amazon search query.
  completionItems?: { category: string; query: string }[];
}

export const EVENTS: EventDefinition[] = [
  // ─── Shared (both markets) ───
  {
    id: "birthday",
    label: "Birthday",
    icon: "🎂",
    subThemes: ["Jungle", "Unicorn", "Superhero", "Cars", "Minimal", "Floral"],
    colorSchemes: ["Pastel", "Bright & bold", "Gold & white", "Rainbow"],
    markets: ["IN", "US"],
    gendered: true,
    completionItems: [
      { category: "Gift", query: "birthday gift" },
      { category: "Party tableware", query: "birthday party tableware set" },
      { category: "Snacks", query: "party snacks pack" },
      { category: "Cake topper", query: "birthday cake topper" },
      { category: "Return favors", query: "return gift party favors" },
      { category: "Candles", query: "birthday number candles" },
    ],
  },
  {
    id: "anniversary",
    label: "Anniversary",
    icon: "💛",
    subThemes: ["Romantic red", "Golden 25th", "Garden", "Minimal"],
    colorSchemes: ["Red & gold", "Rose & white", "Burgundy", "Gold & white"],
    markets: ["IN", "US"],
    completionItems: [
      { category: "Gift", query: "anniversary gift" },
      { category: "Flowers", query: "rose bouquet" },
      { category: "Chocolates", query: "chocolate gift box" },
      { category: "Wine glasses", query: "wine glasses set" },
      { category: "Photo frame", query: "couple photo frame" },
    ],
  },
  {
    id: "baby_shower",
    label: "Baby shower",
    icon: "🍼",
    oneTime: true,
    subThemes: ["Boy blue", "Girl pink", "Neutral", "Woodland", "Cloud & stars"],
    colorSchemes: ["Blue & white", "Pink & white", "Sage & cream", "Pastel mix"],
    markets: ["IN", "US"],
    gendered: true,
    completionItems: [
      { category: "Baby gift", query: "baby gift set" },
      { category: "Shower games", query: "baby shower games" },
      { category: "Guest book", query: "baby shower guest book" },
      { category: "Diaper cake", query: "diaper cake" },
      { category: "Party favors", query: "baby shower party favors" },
    ],
  },

  // ─── India ───
  {
    id: "annaprasan",
    label: "Annaprasan",
    icon: "🍚",
    subThemes: ["Traditional", "Floral marigold", "Pastel", "Royal"],
    colorSchemes: ["Marigold & red", "Pastel pink", "Gold & maroon", "Green & yellow"],
    markets: ["IN"],
    gendered: true,
    completionItems: [
      { category: "Silver gift", query: "silver gift for baby" },
      { category: "Keepsake", query: "baby footprint keepsake" },
      { category: "Sweets", query: "indian sweets gift box" },
      { category: "Baby outfit", query: "baby traditional dress" },
      { category: "Return gifts", query: "pooja return gifts" },
    ],
  },
  {
    id: "diwali",
    label: "Diwali",
    icon: "🪔",
    subThemes: ["Traditional diya", "Rangoli", "Royal", "Modern minimal", "Floral"],
    colorSchemes: ["Marigold & red", "Gold & maroon", "Purple & gold", "Pink & orange"],
    markets: ["IN"],
    season: { month: 10, day: 31 }, // movable (Oct–Nov)
    completionItems: [
      { category: "Sweets", query: "diwali sweets box" },
      { category: "Diyas", query: "diya set decorative" },
      { category: "Dry fruits", query: "dry fruits gift pack" },
      { category: "Gift hamper", query: "diwali gift hamper" },
      { category: "Pooja thali", query: "pooja thali set" },
      { category: "Lights", query: "led string lights" },
    ],
  },
  {
    id: "makar_sankranti",
    label: "Makar Sankranti",
    icon: "🪁",
    subThemes: ["Kite theme", "Traditional", "Floral marigold", "Rustic harvest"],
    colorSchemes: ["Yellow & orange", "Marigold & red", "Green & yellow", "Pastel"],
    markets: ["IN"],
    season: { month: 1, day: 14 },
    completionItems: [
      { category: "Kites", query: "kite set with manjha" },
      { category: "Sweets", query: "til gud chikki gift box" },
      { category: "Sesame treats", query: "tilkut sweets" },
      { category: "Rangoli", query: "rangoli stencil kit" },
      { category: "Return gifts", query: "festival return gifts" },
    ],
  },
  {
    id: "republic_day",
    label: "Republic Day",
    icon: "🇮🇳",
    subThemes: ["Tricolour", "Patriotic", "Modern minimal", "Floral"],
    colorSchemes: ["Saffron, white & green", "Tricolour & gold", "Navy & white"],
    markets: ["IN"],
    season: { month: 1, day: 26 },
    completionItems: [
      { category: "Flags", query: "indian flag tricolour" },
      { category: "Decorations", query: "tricolour party decorations" },
      { category: "Balloons", query: "tricolour balloons" },
      { category: "Badges", query: "tricolour flag badges" },
      { category: "Sweets", query: "indian sweets gift box" },
    ],
  },
  {
    id: "holi",
    label: "Holi",
    icon: "🎨",
    subThemes: ["Colour splash", "Floral", "Traditional", "Modern minimal", "Rustic"],
    colorSchemes: ["Rainbow", "Pink & yellow", "Bright & bold", "Pastel mix"],
    markets: ["IN"],
    season: { month: 3, day: 10 }, // movable (March)
    completionItems: [
      { category: "Colours", query: "herbal holi gulal colours" },
      { category: "Water guns", query: "holi pichkari water gun" },
      { category: "Sweets", query: "gujiya sweets gift box" },
      { category: "Thandai", query: "thandai mix" },
      { category: "Return gifts", query: "holi return gifts" },
    ],
  },
  {
    id: "eid",
    label: "Eid al-Fitr",
    icon: "🌙",
    subThemes: ["Crescent & lantern", "Royal", "Floral", "Modern minimal", "Traditional"],
    colorSchemes: ["Green & gold", "Teal & gold", "Royal blue & silver", "Ivory & gold"],
    markets: ["IN"],
    season: { month: 3, day: 20 }, // movable (shifts ~11 days earlier each year)
    completionItems: [
      { category: "Gift", query: "eid gift set" },
      { category: "Sweets", query: "eid sweets gift box" },
      { category: "Dates", query: "premium dates gift pack" },
      { category: "Lantern", query: "ramadan lantern decor" },
      { category: "Dry fruits", query: "dry fruits gift pack" },
    ],
  },
  {
    id: "raksha_bandhan",
    label: "Raksha Bandhan",
    icon: "🪢",
    subThemes: ["Traditional", "Floral", "Royal", "Modern minimal"],
    colorSchemes: ["Marigold & red", "Pink & gold", "Gold & maroon", "Pastel"],
    markets: ["IN"],
    season: { month: 8, day: 19 }, // movable (August)
    askHonoree: true, // rakhi is for a sibling
    completionItems: [
      { category: "Rakhi", query: "designer rakhi set" },
      { category: "Gift for sister", query: "rakhi gift for sister" },
      { category: "Gift for brother", query: "rakhi gift for brother" },
      { category: "Sweets", query: "indian sweets gift box" },
      { category: "Chocolates", query: "chocolate gift box" },
    ],
  },
  {
    id: "independence_day_in",
    label: "Independence Day",
    icon: "🇮🇳",
    subThemes: ["Tricolour", "Patriotic", "Modern minimal", "Floral"],
    colorSchemes: ["Saffron, white & green", "Tricolour & gold", "Navy & white"],
    markets: ["IN"],
    season: { month: 8, day: 15 },
    completionItems: [
      { category: "Flags", query: "indian flag tricolour" },
      { category: "Decorations", query: "tricolour party decorations" },
      { category: "Balloons", query: "tricolour balloons" },
      { category: "Badges", query: "tricolour flag badges" },
      { category: "Sweets", query: "indian sweets gift box" },
    ],
  },
  {
    id: "janmashtami",
    label: "Janmashtami",
    icon: "🦚",
    subThemes: ["Traditional", "Floral", "Royal", "Jhula / cradle"],
    colorSchemes: ["Peacock blue & gold", "Marigold & red", "Yellow & green", "Gold & maroon"],
    markets: ["IN"],
    season: { month: 8, day: 26 }, // movable (Aug–Sep)
    completionItems: [
      { category: "Krishna idol", query: "laddu gopal idol" },
      { category: "Jhula", query: "krishna jhula cradle" },
      { category: "Flute", query: "decorative bansuri flute" },
      { category: "Sweets", query: "makhan mishri sweets" },
      { category: "Decorations", query: "janmashtami decoration items" },
    ],
  },
  {
    id: "ganesh_chaturthi",
    label: "Ganesh Chaturthi",
    icon: "🐘",
    subThemes: ["Traditional", "Floral marigold", "Royal", "Modern minimal", "Eco-friendly"],
    colorSchemes: ["Marigold & red", "Gold & maroon", "Red & yellow", "Green & gold"],
    markets: ["IN"],
    season: { month: 9, day: 5 }, // movable (Aug–Sep)
    completionItems: [
      { category: "Ganesh idol", query: "eco friendly ganesh idol" },
      { category: "Decorations", query: "ganpati decoration items" },
      { category: "Modak mould", query: "modak mould" },
      { category: "Sweets", query: "modak sweets box" },
      { category: "Pooja kit", query: "pooja samagri kit" },
    ],
  },
  {
    id: "navratri",
    label: "Navratri / Durga Puja",
    icon: "🪘",
    subThemes: ["Garba / dandiya", "Traditional", "Floral", "Royal", "Modern minimal"],
    colorSchemes: ["Marigold & red", "Bright & bold", "Rainbow", "Gold & maroon"],
    markets: ["IN"],
    season: { month: 9, day: 29 }, // movable (Sep–Oct)
    completionItems: [
      { category: "Dandiya", query: "dandiya sticks decorated" },
      { category: "Decorations", query: "navratri decoration items" },
      { category: "Torans", query: "marigold toran door hanging" },
      { category: "Sweets", query: "indian sweets gift box" },
      { category: "Pooja kit", query: "pooja samagri kit" },
    ],
  },
  {
    id: "dussehra",
    label: "Dussehra",
    icon: "🏹",
    subThemes: ["Traditional", "Floral marigold", "Royal", "Modern minimal"],
    colorSchemes: ["Marigold & red", "Gold & maroon", "Red & yellow", "Green & gold"],
    markets: ["IN"],
    season: { month: 10, day: 11 }, // movable (October)
    completionItems: [
      { category: "Decorations", query: "dussehra decoration items" },
      { category: "Torans", query: "marigold toran door hanging" },
      { category: "Sweets", query: "indian sweets gift box" },
      { category: "Pooja kit", query: "pooja samagri kit" },
      { category: "Return gifts", query: "festival return gifts" },
    ],
  },
  {
    id: "housewarming",
    label: "Housewarming",
    icon: "🏡",
    oneTime: true,
    subThemes: ["Traditional", "Floral", "Modern minimal", "Festive"],
    colorSchemes: ["Marigold & red", "Pastel", "Gold & white", "Green & yellow"],
    markets: ["IN", "US"],
    completionItems: [
      { category: "Gift", query: "housewarming gift" },
      { category: "Indoor plant", query: "indoor plant" },
      { category: "Pooja kit", query: "pooja samagri kit" },
      { category: "Scented candles", query: "scented candle set" },
      { category: "Doormat", query: "welcome doormat" },
    ],
  },

  // ─── United States ───
  {
    id: "halloween",
    label: "Halloween",
    icon: "🎃",
    subThemes: ["Spooky", "Haunted house", "Pumpkin patch", "Witch", "Cute / kids"],
    colorSchemes: ["Orange & black", "Purple & green", "Black & gold", "Neon"],
    markets: ["US"],
    season: { month: 10, day: 31 },
    completionItems: [
      { category: "Candy", query: "halloween candy" },
      { category: "Costume", query: "halloween costume" },
      { category: "Treat bags", query: "trick or treat bags" },
      { category: "Props", query: "halloween props" },
      { category: "Party tableware", query: "halloween party tableware" },
    ],
  },
  {
    id: "thanksgiving",
    label: "Thanksgiving",
    icon: "🦃",
    subThemes: ["Rustic harvest", "Modern fall", "Farmhouse", "Floral autumn"],
    colorSchemes: ["Burnt orange & brown", "Gold & cream", "Deep red & amber", "Sage & wheat"],
    markets: ["US"],
    season: { month: 11, day: 26 }, // 4th Thursday of November
    completionItems: [
      { category: "Serveware", query: "thanksgiving serving platter" },
      { category: "Table linens", query: "fall table runner" },
      { category: "Hostess gift", query: "hostess gift" },
      { category: "Pie dish", query: "pie baking dish" },
      { category: "Candles", query: "fall scented candles" },
    ],
  },
  {
    id: "christmas",
    label: "Christmas",
    icon: "🎄",
    subThemes: ["Classic red & green", "Winter wonderland", "Rustic", "Modern minimal", "Nordic"],
    colorSchemes: ["Red & green", "Gold & white", "Silver & blue", "Frosted neutral"],
    markets: ["IN", "US"],
    season: { month: 12, day: 25 },
    completionItems: [
      { category: "Gifts", query: "christmas gift" },
      { category: "Ornaments", query: "christmas ornaments" },
      { category: "Stockings", query: "christmas stockings" },
      { category: "Wrapping paper", query: "christmas wrapping paper" },
      { category: "Treats", query: "christmas chocolate gift" },
      { category: "Lights", query: "christmas string lights" },
    ],
  },
  {
    id: "easter",
    label: "Easter",
    icon: "🐰",
    subThemes: ["Pastel spring", "Floral", "Bunny & eggs", "Garden brunch"],
    colorSchemes: ["Pastel mix", "Lavender & mint", "Pink & yellow", "Blue & white"],
    markets: ["US"],
    season: { month: 4, day: 5 }, // movable (late Mar–Apr)
    completionItems: [
      { category: "Easter basket", query: "easter basket" },
      { category: "Candy", query: "easter candy" },
      { category: "Egg decorating kit", query: "easter egg decorating kit" },
      { category: "Kids gift", query: "easter gift for kids" },
      { category: "Party tableware", query: "easter party tableware" },
    ],
  },
  {
    id: "independence_day",
    label: "4th of July",
    icon: "🎆",
    subThemes: ["Classic patriotic", "Backyard BBQ", "Modern stars & stripes", "Rustic"],
    colorSchemes: ["Red, white & blue", "Navy & gold", "Vintage Americana"],
    markets: ["US"],
    season: { month: 7, day: 4 },
    completionItems: [
      { category: "Party tableware", query: "4th of july party tableware" },
      { category: "Flags", query: "american flags" },
      { category: "BBQ tools", query: "bbq grill tools" },
      { category: "Snacks", query: "party snacks pack" },
      { category: "Decorations", query: "patriotic party supplies" },
    ],
  },
  {
    id: "valentines",
    label: "Valentine's Day",
    icon: "❤️",
    subThemes: ["Romantic", "Floral", "Modern minimal", "Galentine's"],
    colorSchemes: ["Red & pink", "Blush & gold", "Burgundy", "White & rose"],
    markets: ["US"],
    season: { month: 2, day: 14 },
    askHonoree: true, // Valentine's is for a partner
    completionItems: [
      { category: "Gift", query: "valentine gift" },
      { category: "Flowers", query: "red roses bouquet" },
      { category: "Chocolates", query: "chocolate gift box" },
      { category: "Card", query: "valentine greeting card" },
      { category: "Jewelry", query: "valentine jewelry gift" },
    ],
  },
  {
    id: "new_year",
    label: "New Year's Eve",
    icon: "🎉",
    subThemes: ["Gold glam", "Black tie", "Confetti party", "Minimal chic"],
    colorSchemes: ["Black & gold", "Silver & white", "Rose gold", "Midnight blue"],
    markets: ["US"],
    season: { month: 12, day: 31 },
    completionItems: [
      { category: "Party supplies", query: "new years eve party supplies" },
      { category: "Champagne flutes", query: "champagne flutes set" },
      { category: "Party hats", query: "new year party hats" },
      { category: "Confetti poppers", query: "confetti poppers" },
      { category: "Balloons", query: "new year balloons" },
    ],
  },
  {
    id: "graduation",
    label: "Graduation",
    icon: "🎓",
    subThemes: ["Classic", "Modern", "Floral", "Bold"],
    colorSchemes: ["Black & gold", "School colors", "Navy & silver", "Pastel"],
    markets: ["US"],
    completionItems: [
      { category: "Gift", query: "graduation gift" },
      { category: "Party supplies", query: "graduation party supplies" },
      { category: "Photo props", query: "graduation photo props" },
      { category: "Flowers", query: "graduation flower bouquet" },
      { category: "Card", query: "graduation card" },
    ],
  },
];

/** How many months ahead of a festival it starts being offered. */
export const EVENT_LEAD_MONTHS = 3;

/** How many days ahead a festival counts as "trending" on the public gallery.
 *  90 keeps the whole Aug–Sep Indian festival run in view at once (Independence
 *  Day → Raksha Bandhan → Janmashtami → Ganesh Chaturthi → Navratri), which is
 *  the season people actually plan décor for. */
export const TRENDING_WINDOW_DAYS = 90;

/** Midnight-normalised copy of `now`. */
function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** A festival's next occurrence of its `season` anchor — this year's date, rolled
 *  to next year once it's past. Null for evergreen events (no `season`). */
function nextSeasonOccurrence(ev: EventDefinition, today: Date): Date | null {
  if (!ev.season) return null;
  const { month, day } = ev.season;
  const occ = new Date(today.getFullYear(), month - 1, day);
  return occ < today ? new Date(today.getFullYear() + 1, month - 1, day) : occ;
}

/** Whether a seasonal festival's next occurrence is close enough to offer now.
 *  Evergreen events (no `season`) are always available. */
export function isSeasonalEventNear(
  ev: EventDefinition,
  now: Date = new Date()
): boolean {
  const today = startOfDay(now);
  const occ = nextSeasonOccurrence(ev, today);
  if (!occ) return true; // evergreen — birthdays, anniversaries, life events
  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + EVENT_LEAD_MONTHS);
  return occ <= horizon;
}

/** Days until a festival's next occurrence. Null for evergreen events, which have
 *  no calendar anchor and so are never "upcoming". */
export function daysUntilSeason(
  ev: EventDefinition,
  now: Date = new Date()
): number | null {
  const today = startOfDay(now);
  const occ = nextSeasonOccurrence(ev, today);
  if (!occ) return null;
  return Math.round((occ.getTime() - today.getTime()) / 86_400_000);
}

/** Seasonal events for `locale` whose next occurrence falls within `withinDays`,
 *  soonest first. Drives the gallery's "Trending" tag and ordering. Evergreen
 *  events (birthday, anniversary, life events) are deliberately excluded — they
 *  have no season, so they are never "coming up". */
export function getUpcomingSeasonalEvents(
  locale: Locale,
  now: Date = new Date(),
  withinDays: number = TRENDING_WINDOW_DAYS
): { event: EventDefinition; daysUntil: number }[] {
  return EVENTS.filter((e) => e.markets.includes(locale) && e.season)
    .map((event) => ({ event, daysUntil: daysUntilSeason(event, now) as number }))
    .filter(({ daysUntil }) => daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Events available for a given marketplace, in season (or evergreen) as of `now`. */
export function getEvents(locale: Locale, now: Date = new Date()): EventDefinition[] {
  return EVENTS.filter(
    (e) => e.markets.includes(locale) && isSeasonalEventNear(e, now)
  );
}

export function getEvent(id: string): EventDefinition | undefined {
  return EVENTS.find((e) => e.id === id);
}

/** One-off life events (baby shower, housewarming) that don't recur annually. */
export function isOneTimeEvent(id: string): boolean {
  return getEvent(id)?.oneTime === true;
}
