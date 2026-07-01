export interface MakeoverExtraItem {
  category: string;
  query: string;
}

export interface MakeoverStyle {
  id: string;
  label: string;
  icon: string;
  categories: string[];
  searchHints: string;
  /** Scene/backdrop the generated photo is placed in to match the look. */
  scene: string;
  /** Complementary accessories shown in the async "Complete the look" grid. */
  extras: MakeoverExtraItem[];
}

export const MAKEOVER_STYLES: MakeoverStyle[] = [
  { id: "office", label: "Office / Professional", icon: "💼", categories: ["blazer", "trousers or skirt", "blouse or shirt", "shoes", "bag"], searchHints: "Polished structured workwear. Neutral palettes.", scene: "a bright modern corporate office with glass walls and soft daylight", extras: [{ category: "Watch", query: "leather strap analog watch" }, { category: "Bag", query: "laptop office tote bag" }, { category: "Fragrance", query: "office perfume eau de parfum" }, { category: "Belt", query: "formal leather belt" }] },
  { id: "casual", label: "Casual / Everyday", icon: "👟", categories: ["t-shirt or top", "jeans or pants", "shoes", "bag", "accessory"], searchHints: "Relaxed comfortable everyday wear.", scene: "a sunlit city sidewalk with trees and shopfronts, casual daytime", extras: [{ category: "Sunglasses", query: "casual sunglasses unisex" }, { category: "Backpack", query: "everyday casual backpack" }, { category: "Watch", query: "casual silicone watch" }, { category: "Cap", query: "cotton baseball cap" }] },
  { id: "party", label: "Party / Evening", icon: "🎉", categories: ["dress or top", "skirt or trousers", "heels or dressy shoes", "clutch", "jewellery"], searchHints: "Glamorous evening. Bold colours or metallics.", scene: "an upscale evening party venue with warm bokeh lights and elegant decor", extras: [{ category: "Clutch", query: "party clutch bag" }, { category: "Jewellery", query: "statement earrings party" }, { category: "Fragrance", query: "evening perfume" }, { category: "Heels", query: "party high heels" }] },
  { id: "beach", label: "Beach / Vacation", icon: "🏖️", categories: ["swimwear or bikini", "cover-up or dress", "sandals", "sunglasses", "beach bag"], searchHints: "Breezy summer resort wear.", scene: "a sunny tropical beach with golden sand, blue sea, and clear sky", extras: [{ category: "Hat", query: "wide brim beach hat" }, { category: "Sunscreen", query: "sunscreen spf 50" }, { category: "Beach bag", query: "straw beach tote bag" }, { category: "Sunglasses", query: "beach sunglasses uv" }] },
  { id: "date-night", label: "Date Night", icon: "🌙", categories: ["dress or top", "trousers or skirt", "heels", "bag"], searchHints: "Romantic elegant evening look.", scene: "a cozy candlelit restaurant at night with soft warm ambient lighting", extras: [{ category: "Fragrance", query: "romantic perfume" }, { category: "Watch", query: "elegant dress watch" }, { category: "Clutch", query: "evening clutch bag" }, { category: "Jewellery", query: "delicate pendant necklace" }] },
  { id: "gym", label: "Gym / Sporty", icon: "🏋️", categories: ["sports top or tank", "leggings or shorts", "trainers", "gym bag"], searchHints: "Performance athletic wear.", scene: "a modern fitness gym with equipment and bright even lighting", extras: [{ category: "Bottle", query: "gym water bottle" }, { category: "Fitness band", query: "fitness tracker band" }, { category: "Gym bag", query: "sports duffel gym bag" }, { category: "Shaker", query: "protein shaker bottle" }] },
  { id: "brunch", label: "Brunch / Weekend", icon: "☕", categories: ["top or blouse", "jeans or midi skirt", "sneakers or sandals", "bag"], searchHints: "Smart casual weekend vibes.", scene: "a charming outdoor cafe terrace with greenery and morning sunlight", extras: [{ category: "Sunglasses", query: "trendy sunglasses" }, { category: "Tote", query: "canvas tote bag" }, { category: "Watch", query: "minimalist watch" }, { category: "Hat", query: "straw fedora hat" }] },
  { id: "festival", label: "Festival", icon: "🎵", categories: ["top or crop", "shorts or skirt", "boots", "bag", "hat or accessory"], searchHints: "Boho eclectic festival fashion.", scene: "an outdoor music festival field with crowds and stage lights at golden hour", extras: [{ category: "Bum bag", query: "festival waist belt bag" }, { category: "Sunglasses", query: "round festival sunglasses" }, { category: "Bandana", query: "printed bandana scarf" }, { category: "Jewellery", query: "layered boho necklace" }] },
  { id: "formal", label: "Formal / Wedding Guest", icon: "👗", categories: ["formal dress or suit", "heels or dress shoes", "clutch", "jewellery"], searchHints: "Elegant formal occasion attire.", scene: "an elegant wedding reception hall with floral arrangements and chandeliers", extras: [{ category: "Clutch", query: "embellished evening clutch" }, { category: "Jewellery", query: "formal jewellery set" }, { category: "Fragrance", query: "luxury perfume" }, { category: "Cufflinks", query: "formal cufflinks men" }] },
  { id: "street", label: "Street Style", icon: "🧢", categories: ["hoodie or jacket", "joggers or jeans", "trainers", "cap or beanie", "bag"], searchHints: "Urban streetwear with attitude.", scene: "a gritty urban street with graffiti walls and neon signage", extras: [{ category: "Cap", query: "streetwear snapback cap" }, { category: "Chain", query: "chain necklace streetwear" }, { category: "Backpack", query: "urban sling backpack" }, { category: "Sunglasses", query: "retro square sunglasses" }] },
  { id: "winter-cozy", label: "Winter / Cozy", icon: "🧥", categories: ["coat or puffer", "knitwear or sweater", "trousers or jeans", "boots", "scarf"], searchHints: "Warm layered winter outfits.", scene: "a snowy winter street with soft overcast light and light snowfall", extras: [{ category: "Beanie", query: "knit winter beanie" }, { category: "Gloves", query: "wool winter gloves" }, { category: "Scarf", query: "warm knit scarf" }, { category: "Socks", query: "thermal winter socks" }] },
  { id: "biz-casual", label: "Business Casual", icon: "👔", categories: ["smart blouse or shirt", "chinos or tailored pants", "loafers or flats", "bag"], searchHints: "Relaxed professional, no suit required.", scene: "a stylish co-working cafe with warm wood interiors and daylight", extras: [{ category: "Watch", query: "minimalist leather watch" }, { category: "Bag", query: "laptop sleeve bag" }, { category: "Belt", query: "casual leather belt" }, { category: "Fragrance", query: "daytime perfume" }] },
];

export function getMakeoverStyle(id: string): MakeoverStyle | undefined {
  return MAKEOVER_STYLES.find((s) => s.id === id);
}

export function getMakeoverStyleByLabel(label: string): MakeoverStyle | undefined {
  return MAKEOVER_STYLES.find((s) => s.label === label);
}
