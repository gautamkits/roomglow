import type { Locale } from "@/lib/locale";

export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  subThemes: string[];
  colorSchemes: string[];
  markets: Locale[]; // which marketplaces show this event
  gendered?: boolean; // show the boy/girl/neutral picker (child-centric events)
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
  },
  {
    id: "anniversary",
    label: "Anniversary",
    icon: "💛",
    subThemes: ["Romantic red", "Golden 25th", "Garden", "Minimal"],
    colorSchemes: ["Red & gold", "Rose & white", "Burgundy", "Gold & white"],
    markets: ["IN", "US"],
  },
  {
    id: "baby_shower",
    label: "Baby shower",
    icon: "🍼",
    subThemes: ["Boy blue", "Girl pink", "Neutral", "Woodland", "Cloud & stars"],
    colorSchemes: ["Blue & white", "Pink & white", "Sage & cream", "Pastel mix"],
    markets: ["IN", "US"],
    gendered: true,
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
  },
  {
    id: "diwali",
    label: "Diwali",
    icon: "🪔",
    subThemes: ["Traditional diya", "Rangoli", "Royal", "Modern minimal", "Floral"],
    colorSchemes: ["Marigold & red", "Gold & maroon", "Purple & gold", "Pink & orange"],
    markets: ["IN"],
  },
  {
    id: "housewarming",
    label: "Housewarming",
    icon: "🏡",
    subThemes: ["Traditional", "Floral", "Modern minimal", "Festive"],
    colorSchemes: ["Marigold & red", "Pastel", "Gold & white", "Green & yellow"],
    markets: ["IN", "US"],
  },

  // ─── United States ───
  {
    id: "halloween",
    label: "Halloween",
    icon: "🎃",
    subThemes: ["Spooky", "Haunted house", "Pumpkin patch", "Witch", "Cute / kids"],
    colorSchemes: ["Orange & black", "Purple & green", "Black & gold", "Neon"],
    markets: ["US"],
  },
  {
    id: "thanksgiving",
    label: "Thanksgiving",
    icon: "🦃",
    subThemes: ["Rustic harvest", "Modern fall", "Farmhouse", "Floral autumn"],
    colorSchemes: ["Burnt orange & brown", "Gold & cream", "Deep red & amber", "Sage & wheat"],
    markets: ["US"],
  },
  {
    id: "christmas",
    label: "Christmas",
    icon: "🎄",
    subThemes: ["Classic red & green", "Winter wonderland", "Rustic", "Modern minimal", "Nordic"],
    colorSchemes: ["Red & green", "Gold & white", "Silver & blue", "Frosted neutral"],
    markets: ["US"],
  },
  {
    id: "easter",
    label: "Easter",
    icon: "🐰",
    subThemes: ["Pastel spring", "Floral", "Bunny & eggs", "Garden brunch"],
    colorSchemes: ["Pastel mix", "Lavender & mint", "Pink & yellow", "Blue & white"],
    markets: ["US"],
  },
  {
    id: "independence_day",
    label: "4th of July",
    icon: "🎆",
    subThemes: ["Classic patriotic", "Backyard BBQ", "Modern stars & stripes", "Rustic"],
    colorSchemes: ["Red, white & blue", "Navy & gold", "Vintage Americana"],
    markets: ["US"],
  },
  {
    id: "valentines",
    label: "Valentine's Day",
    icon: "❤️",
    subThemes: ["Romantic", "Floral", "Modern minimal", "Galentine's"],
    colorSchemes: ["Red & pink", "Blush & gold", "Burgundy", "White & rose"],
    markets: ["US"],
  },
  {
    id: "new_year",
    label: "New Year's Eve",
    icon: "🎉",
    subThemes: ["Gold glam", "Black tie", "Confetti party", "Minimal chic"],
    colorSchemes: ["Black & gold", "Silver & white", "Rose gold", "Midnight blue"],
    markets: ["US"],
  },
  {
    id: "graduation",
    label: "Graduation",
    icon: "🎓",
    subThemes: ["Classic", "Modern", "Floral", "Bold"],
    colorSchemes: ["Black & gold", "School colors", "Navy & silver", "Pastel"],
    markets: ["US"],
  },
];

/** Events available for a given marketplace. */
export function getEvents(locale: Locale): EventDefinition[] {
  return EVENTS.filter((e) => e.markets.includes(locale));
}

export function getEvent(id: string): EventDefinition | undefined {
  return EVENTS.find((e) => e.id === id);
}
