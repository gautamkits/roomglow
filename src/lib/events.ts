import type { Locale } from "@/lib/locale";

export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  subThemes: string[];
  colorSchemes: string[];
  markets: Locale[]; // which marketplaces show this event
  gendered?: boolean; // show the boy/girl/neutral picker (child-centric events)
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
    id: "housewarming",
    label: "Housewarming",
    icon: "🏡",
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
    markets: ["US"],
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

/** Events available for a given marketplace. */
export function getEvents(locale: Locale): EventDefinition[] {
  return EVENTS.filter((e) => e.markets.includes(locale));
}

export function getEvent(id: string): EventDefinition | undefined {
  return EVENTS.find((e) => e.id === id);
}
