export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  subThemes: string[];
  colorSchemes: string[];
}

export const EVENTS: EventDefinition[] = [
  {
    id: "birthday",
    label: "Birthday",
    icon: "🎂",
    subThemes: ["Jungle", "Unicorn", "Superhero", "Cars", "Minimal", "Floral"],
    colorSchemes: ["Pastel", "Bright & bold", "Gold & white", "Rainbow"],
  },
  {
    id: "anniversary",
    label: "Anniversary",
    icon: "💛",
    subThemes: ["Romantic red", "Golden 25th", "Garden", "Minimal"],
    colorSchemes: ["Red & gold", "Rose & white", "Burgundy", "Gold & white"],
  },
  {
    id: "annaprasan",
    label: "Annaprasan",
    icon: "🍚",
    subThemes: ["Traditional", "Floral marigold", "Pastel", "Royal"],
    colorSchemes: ["Marigold & red", "Pastel pink", "Gold & maroon", "Green & yellow"],
  },
  {
    id: "baby_shower",
    label: "Baby shower",
    icon: "🍼",
    subThemes: ["Boy blue", "Girl pink", "Neutral", "Woodland", "Cloud & stars"],
    colorSchemes: ["Blue & white", "Pink & white", "Sage & cream", "Pastel mix"],
  },
];

export function getEvent(id: string): EventDefinition | undefined {
  return EVENTS.find((e) => e.id === id);
}
