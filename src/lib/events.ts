import type { Locale } from "@/lib/locale";
import type { EventConfig } from "@/lib/types";

/**
 * The one-paragraph event brief threaded into every AI step (analyze,
 * recommend, render). A string here vs `undefined` IS the event-vs-room branch
 * server-side.
 *
 * Lives in lib rather than the create-flow hook only because the admin
 * regenerate-and-send path builds it server-side too — both callers must
 * produce byte-identical context or the two paths would drift.
 */
export function buildEventContext(cfg: EventConfig | null): string | undefined {
  if (!cfg) return undefined;
  // The UI label is written for the user, who already knows which country they
  // are in ("Independence Day"). The model does not, and it is told to put the
  // occasion verbatim into the Amazon search query — so an ambiguous label
  // returns the wrong country's merchandise (Indian Independence Day designs
  // were pulling "God Bless America" props). Prefer an unambiguous promptLabel.
  const def = EVENTS.find((e) => e.id === cfg.eventType);
  const label = def?.promptLabel || cfg.eventLabel;
  // The render prompt's flag rules are all preservation ("reproduce what is
  // already there unchanged"), so a bare pole renders bare — right for a
  // birthday, wrong on the one day the pole is the point. Ask for it here, in
  // the event brief, so it can only ever reach the event branch: space passes
  // no cfg at all and returns above.
  const flag = def?.nationalFlag
    ? ` If a flagpole or flagstaff is already standing in the photo with nothing flying on it, hoist ${def.nationalFlag} at the top of it, unfurled and flying naturally. Render it correctly: saffron band at the top, 3:2 proportions, right way up. Never drape a national flag as bunting, tablecloth, backdrop or wrapping, and never let added décor cover it. Do NOT invent a flagpole that is not already in the photo, and do not move or restyle the one that is.`
    : "";
  const honoree = cfg.honoree ? ` It is for ${cfg.honoree}.` : "";
  const gender =
    cfg.gender && cfg.gender !== "Either / neutral"
      ? ` The celebration is for a ${cfg.gender.toLowerCase()}, so lean the palette and themed props accordingly (e.g. blue tones for a boy, pink tones for a girl) while still honoring the chosen "${cfg.colorScheme}" colors.`
      : "";
  // Who it's for changes what the décor should LOOK like, not just who receives
  // it — a parent's 60th and a child's 5th are the same event id but must not
  // render the same props. Only reachable from the event branch (space returns
  // above), so this cannot alter room redesigns.
  const audience = cfg.celebrationFor
    ? ` ${CELEBRATION_FOR[cfg.celebrationFor]?.directive ?? ""}`.trimEnd()
    : "";
  return `This space will host a ${label} with a "${cfg.subTheme}" theme using a ${cfg.colorScheme} color scheme.${gender}${audience}${honoree} All signage and décor must match a ${label} — never a different occasion, and never another country's version of the same-named holiday.${flag}`;
}

export interface CelebrationForOption {
  id: string;
  label: string;
  icon: string;
  /**
   * Appended to the event brief, so it reaches analyze, recommend AND render.
   * Written as décor direction rather than gift direction — noosho decorates a
   * venue, it does not pick a present for the honoree.
   */
  directive: string;
  /**
   * Whether the boy/girl palette picker still makes sense. A father's birthday
   * with "The celebration is for a boy" appended is nonsense, and worse, two
   * contradictory sentences in one brief.
   */
  childCentric?: boolean;
}

/**
 * Relationship options, shared across events so "My spouse" reads identically
 * on a birthday and an anniversary. Events opt in via `celebrationFor` and pick
 * their own subset + order.
 */
export const CELEBRATION_FOR: Record<string, CelebrationForOption> = {
  myself: {
    id: "myself",
    label: "Myself",
    icon: "🤗",
    directive:
      "The host is celebrating their own occasion, so the space should feel welcoming to guests rather than built around surprising one person.",
  },
  my_child: {
    id: "my_child",
    label: "My child",
    icon: "🧒",
    childCentric: true,
    directive:
      "It is a young child's celebration: playful and colourful, with décor placed low enough for a small child to stand among it — balloon arches, character cutouts, floor props and a photo spot at child height.",
  },
  my_parent: {
    id: "my_parent",
    label: "My parent",
    icon: "👴",
    directive:
      "It is for a parent or elder, so keep the décor grown-up and dignified — fresh florals, fabric drapes, elegant lettering and warm lighting. No cartoon characters, no novelty kiddie props, no character cutouts.",
  },
  my_spouse: {
    id: "my_spouse",
    label: "My spouse",
    icon: "💑",
    directive:
      "It is for the host's spouse or partner, so stage it as an intimate setting for two — candlelight, florals and a soft focal seating or dining spot — not a crowd-facing party set.",
  },
  a_friend: {
    id: "a_friend",
    label: "A friend",
    icon: "🤝",
    directive:
      "It is for a friend, so keep the styling social and relaxed — a photo-worthy focal wall and comfortable standing room for a group.",
  },
  a_colleague: {
    id: "a_colleague",
    label: "A colleague",
    icon: "👔",
    directive:
      "It is a workplace celebration, so keep the décor tasteful and office-appropriate — restrained colours, tidy lettering, nothing childish or overly personal.",
  },
  my_parents: {
    id: "my_parents",
    label: "My parents",
    icon: "👵",
    directive:
      "It is for the host's parents as a couple, so lean classic and celebratory of a long marriage — florals, drapes, warm metallics and a milestone-number focal piece rather than youthful party props.",
  },
  the_couple: {
    id: "the_couple",
    label: "The couple",
    icon: "💕",
    directive:
      "It is for a couple, so give the setting a shared focal point — a two-seat or centre-stage arrangement framed by the décor.",
  },
  the_baby: {
    id: "the_baby",
    label: "The baby",
    icon: "👶",
    childCentric: true,
    directive:
      "It centres on a new baby, so keep the palette soft and the props gentle — pastel balloons, cloud and star motifs, plush textures, nothing sharp or garish.",
  },
  family: {
    id: "family",
    label: "My family",
    icon: "👨‍👩‍👧‍👦",
    directive:
      "It is a whole-family occasion, so the décor should suit mixed ages together — a generous shared focal area rather than styling aimed at any one person.",
  },
};

/** Relationship options offered for an event, in display order. */
export function getCelebrationForOptions(
  eventId: string | undefined
): CelebrationForOption[] {
  if (!eventId) return [];
  const def = EVENTS.find((e) => e.id === eventId);
  return (def?.celebrationFor ?? [])
    .map((id) => CELEBRATION_FOR[id])
    .filter((o): o is CelebrationForOption => !!o);
}

/** Whether a chosen relationship still warrants the boy/girl palette picker. */
export function isChildCentricAudience(celebrationFor?: string): boolean {
  if (!celebrationFor) return true;
  return !!CELEBRATION_FOR[celebrationFor]?.childCentric;
}

export interface EventDefinition {
  id: string;
  label: string;
  icon: string;
  subThemes: string[];
  colorSchemes: string[];
  markets: Locale[]; // which marketplaces show this event
  // Name given to the AI instead of `label`, for holidays whose label is
  // ambiguous across markets. `label` is what the user sees and must stay
  // natural in their market; `promptLabel` is what lands in the Amazon search
  // query, so it has to name the country/date explicitly.
  promptLabel?: string;
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
  // Relationship options for "who's it for?" (ids into CELEBRATION_FOR), in
  // display order. Absent = don't ask. This is the answer that changes what the
  // décor looks like; `honoree` only supplies the name to print on it.
  celebrationFor?: string[];
  // National-day events where a bare flagpole in the photo should be flown, not
  // just preserved. The generic décor rules only ever say "reproduce what is
  // already there unchanged", so an empty pole stays empty — correct for every
  // other occasion, wrong for a flag-hoisting holiday. Value is the flag's
  // unambiguous name, since "the national flag" alone gets the wrong country's.
  nationalFlag?: string;
  // Occasion-specific buyables (beyond décor) for the "Complete the occasion"
  // grid — gifts, treats, tableware, etc. Each is a plain Amazon search query.
  // `markets` narrows an individual item within an event that itself ships to
  // both markets (a housewarming pooja kit means nothing to a US shopper);
  // omit it and the item shows everywhere the event does.
  completionItems?: { category: string; query: string; markets?: Locale[] }[];
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
    celebrationFor: [
      "my_child",
      "myself",
      "my_spouse",
      "my_parent",
      "a_friend",
      "a_colleague",
    ],
    completionItems: [
      { category: "Backdrop", query: "birthday decoration backdrop" },
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
    celebrationFor: ["my_spouse", "my_parents", "the_couple", "a_friend"],
    completionItems: [
      { category: "Backdrop", query: "anniversary decoration backdrop" },
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
    celebrationFor: ["myself", "the_baby", "a_friend", "family"],
    completionItems: [
      { category: "Backdrop", query: "baby shower backdrop" },
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
      { category: "Backdrop", query: "annaprasan backdrop decoration" },
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
      { category: "Backdrop", query: "diwali backdrop decoration" },
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
    nationalFlag: "the Indian national flag (Tiranga)",
    icon: "🇮🇳",
    subThemes: ["Tricolour", "Patriotic", "Modern minimal", "Floral"],
    colorSchemes: ["Saffron, white & green", "Tricolour & gold", "Navy & white"],
    markets: ["IN"],
    season: { month: 1, day: 26 },
    completionItems: [
      { category: "Backdrop", query: "tricolour backdrop decoration" },
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
      { category: "Backdrop", query: "eid decoration backdrop" },
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
    // Bare "Independence Day" made the AI search Amazon for US July-4th goods.
    promptLabel: "Indian Independence Day (15 August, tricolour / desh bhakti)",
    nationalFlag: "the Indian national flag (Tiranga)",
    icon: "🇮🇳",
    subThemes: ["Tricolour", "Patriotic", "Modern minimal", "Floral"],
    colorSchemes: ["Saffron, white & green", "Tricolour & gold", "Navy & white"],
    markets: ["IN"],
    season: { month: 8, day: 15 },
    completionItems: [
      { category: "Backdrop", query: "tricolour backdrop decoration" },
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
      { category: "Backdrop", query: "janmashtami backdrop decoration" },
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
      { category: "Backdrop", query: "ganpati mandap backdrop cloth" },
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
      { category: "Backdrop", query: "navratri backdrop decoration" },
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
      { category: "Backdrop", query: "dussehra backdrop decoration" },
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
    celebrationFor: ["myself", "family", "a_friend"],
    completionItems: [
      { category: "Backdrop", query: "housewarming backdrop decoration" },
      { category: "Gift", query: "housewarming gift" },
      { category: "Indoor plant", query: "indoor plant" },
      { category: "Pooja kit", query: "pooja samagri kit", markets: ["IN"] },
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
      { category: "Backdrop", query: "halloween party backdrop" },
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
      { category: "Backdrop", query: "thanksgiving party backdrop" },
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
      { category: "Backdrop", query: "christmas backdrop decoration" },
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
      { category: "Backdrop", query: "easter party backdrop" },
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
      { category: "Backdrop", query: "4th of july party backdrop" },
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
    markets: ["IN", "US"],
    season: { month: 2, day: 14 },
    askHonoree: true, // Valentine's is for a partner
    // "Galentine's" is one of the subThemes, so a friend is a real answer here.
    celebrationFor: ["my_spouse", "the_couple", "a_friend"],
    completionItems: [
      { category: "Backdrop", query: "valentine decoration backdrop" },
      { category: "Gift", query: "valentine gift" },
      { category: "Flowers", query: "red roses bouquet" },
      { category: "Chocolates", query: "chocolate gift box" },
      { category: "Card", query: "valentine greeting card" },
      { category: "Jewelry", query: "valentine jewelry gift" },
      // Teddy Day is part of Valentine's Week in India — a soft toy is the
      // archetypal gift there and barely registers in the US.
      { category: "Soft toy", query: "teddy bear gift", markets: ["IN"] },
    ],
  },
  {
    id: "new_year",
    label: "New Year's Eve",
    icon: "🎉",
    subThemes: ["Gold glam", "Black tie", "Confetti party", "Minimal chic"],
    colorSchemes: ["Black & gold", "Silver & white", "Rose gold", "Midnight blue"],
    markets: ["IN", "US"],
    season: { month: 12, day: 31 },
    completionItems: [
      { category: "Backdrop", query: "new year party backdrop" },
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
    // "School colors" is a US tradition; India reads the same slot as convocation
    // regalia, so keep both and let the user pick.
    colorSchemes: ["Black & gold", "School colors", "Navy & silver", "Pastel"],
    markets: ["IN", "US"],
    celebrationFor: ["myself", "my_child", "a_friend", "family"],
    completionItems: [
      { category: "Backdrop", query: "graduation party backdrop" },
      { category: "Gift", query: "graduation gift" },
      { category: "Party supplies", query: "graduation party supplies" },
      { category: "Photo props", query: "graduation photo props" },
      { category: "Flowers", query: "graduation flower bouquet" },
      { category: "Card", query: "graduation card" },
      // Indian convocations centre on the sash/stole rather than the US cap-toss.
      { category: "Convocation sash", query: "convocation graduation stole", markets: ["IN"] },
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
