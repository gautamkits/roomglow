export interface MakeoverStyle {
  id: string;
  label: string;
  icon: string;
  categories: string[];
  searchHints: string;
}

export const MAKEOVER_STYLES: MakeoverStyle[] = [
  { id: "office", label: "Office / Professional", icon: "💼", categories: ["blazer", "trousers or skirt", "blouse or shirt", "shoes", "bag"], searchHints: "Polished structured workwear. Neutral palettes." },
  { id: "casual", label: "Casual / Everyday", icon: "👟", categories: ["t-shirt or top", "jeans or pants", "shoes", "bag", "accessory"], searchHints: "Relaxed comfortable everyday wear." },
  { id: "party", label: "Party / Evening", icon: "🎉", categories: ["dress or top", "skirt or trousers", "heels or dressy shoes", "clutch", "jewellery"], searchHints: "Glamorous evening. Bold colours or metallics." },
  { id: "beach", label: "Beach / Vacation", icon: "🏖️", categories: ["swimwear or bikini", "cover-up or dress", "sandals", "sunglasses", "beach bag"], searchHints: "Breezy summer resort wear." },
  { id: "date-night", label: "Date Night", icon: "🌙", categories: ["dress or top", "trousers or skirt", "heels", "bag"], searchHints: "Romantic elegant evening look." },
  { id: "gym", label: "Gym / Sporty", icon: "🏋️", categories: ["sports top or tank", "leggings or shorts", "trainers", "gym bag"], searchHints: "Performance athletic wear." },
  { id: "brunch", label: "Brunch / Weekend", icon: "☕", categories: ["top or blouse", "jeans or midi skirt", "sneakers or sandals", "bag"], searchHints: "Smart casual weekend vibes." },
  { id: "festival", label: "Festival", icon: "🎵", categories: ["top or crop", "shorts or skirt", "boots", "bag", "hat or accessory"], searchHints: "Boho eclectic festival fashion." },
  { id: "formal", label: "Formal / Wedding Guest", icon: "👗", categories: ["formal dress or suit", "heels or dress shoes", "clutch", "jewellery"], searchHints: "Elegant formal occasion attire." },
  { id: "street", label: "Street Style", icon: "🧢", categories: ["hoodie or jacket", "joggers or jeans", "trainers", "cap or beanie", "bag"], searchHints: "Urban streetwear with attitude." },
  { id: "winter-cozy", label: "Winter / Cozy", icon: "🧥", categories: ["coat or puffer", "knitwear or sweater", "trousers or jeans", "boots", "scarf"], searchHints: "Warm layered winter outfits." },
  { id: "biz-casual", label: "Business Casual", icon: "👔", categories: ["smart blouse or shirt", "chinos or tailored pants", "loafers or flats", "bag"], searchHints: "Relaxed professional, no suit required." },
];

export function getMakeoverStyle(id: string): MakeoverStyle | undefined {
  return MAKEOVER_STYLES.find((s) => s.id === id);
}
