export interface MakeoverStyle {
  id: string;
  label: string;
  icon: string;
  categories: string[];
  searchHints: string;
  /** Scene/backdrop the generated photo is placed in to match the look. */
  scene: string;
}

export const MAKEOVER_STYLES: MakeoverStyle[] = [
  { id: "office", label: "Office / Professional", icon: "💼", categories: ["blazer", "trousers or skirt", "blouse or shirt", "shoes", "bag"], searchHints: "Polished structured workwear. Neutral palettes.", scene: "a bright modern corporate office with glass walls and soft daylight" },
  { id: "casual", label: "Casual / Everyday", icon: "👟", categories: ["t-shirt or top", "jeans or pants", "shoes", "bag", "accessory"], searchHints: "Relaxed comfortable everyday wear.", scene: "a sunlit city sidewalk with trees and shopfronts, casual daytime" },
  { id: "party", label: "Party / Evening", icon: "🎉", categories: ["dress or top", "skirt or trousers", "heels or dressy shoes", "clutch", "jewellery"], searchHints: "Glamorous evening. Bold colours or metallics.", scene: "an upscale evening party venue with warm bokeh lights and elegant decor" },
  { id: "beach", label: "Beach / Vacation", icon: "🏖️", categories: ["swimwear or bikini", "cover-up or dress", "sandals", "sunglasses", "beach bag"], searchHints: "Breezy summer resort wear.", scene: "a sunny tropical beach with golden sand, blue sea, and clear sky" },
  { id: "date-night", label: "Date Night", icon: "🌙", categories: ["dress or top", "trousers or skirt", "heels", "bag"], searchHints: "Romantic elegant evening look.", scene: "a cozy candlelit restaurant at night with soft warm ambient lighting" },
  { id: "gym", label: "Gym / Sporty", icon: "🏋️", categories: ["sports top or tank", "leggings or shorts", "trainers", "gym bag"], searchHints: "Performance athletic wear.", scene: "a modern fitness gym with equipment and bright even lighting" },
  { id: "brunch", label: "Brunch / Weekend", icon: "☕", categories: ["top or blouse", "jeans or midi skirt", "sneakers or sandals", "bag"], searchHints: "Smart casual weekend vibes.", scene: "a charming outdoor cafe terrace with greenery and morning sunlight" },
  { id: "festival", label: "Festival", icon: "🎵", categories: ["top or crop", "shorts or skirt", "boots", "bag", "hat or accessory"], searchHints: "Boho eclectic festival fashion.", scene: "an outdoor music festival field with crowds and stage lights at golden hour" },
  { id: "formal", label: "Formal / Wedding Guest", icon: "👗", categories: ["formal dress or suit", "heels or dress shoes", "clutch", "jewellery"], searchHints: "Elegant formal occasion attire.", scene: "an elegant wedding reception hall with floral arrangements and chandeliers" },
  { id: "street", label: "Street Style", icon: "🧢", categories: ["hoodie or jacket", "joggers or jeans", "trainers", "cap or beanie", "bag"], searchHints: "Urban streetwear with attitude.", scene: "a gritty urban street with graffiti walls and neon signage" },
  { id: "winter-cozy", label: "Winter / Cozy", icon: "🧥", categories: ["coat or puffer", "knitwear or sweater", "trousers or jeans", "boots", "scarf"], searchHints: "Warm layered winter outfits.", scene: "a snowy winter street with soft overcast light and light snowfall" },
  { id: "biz-casual", label: "Business Casual", icon: "👔", categories: ["smart blouse or shirt", "chinos or tailored pants", "loafers or flats", "bag"], searchHints: "Relaxed professional, no suit required.", scene: "a stylish co-working cafe with warm wood interiors and daylight" },
];

export function getMakeoverStyle(id: string): MakeoverStyle | undefined {
  return MAKEOVER_STYLES.find((s) => s.id === id);
}

export function getMakeoverStyleByLabel(label: string): MakeoverStyle | undefined {
  return MAKEOVER_STYLES.find((s) => s.label === label);
}
