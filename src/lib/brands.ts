/**
 * Known-brand allowlist for the **Personal Makeover** flow only.
 *
 * Amazon fashion search is full of unbranded drop-ship listings; for an outfit
 * the user is meant to actually buy and wear, a recognisable label is most of
 * the trust. Space and event designs deliberately do NOT use this — decor is
 * dominated by legitimately generic sellers, and a brand gate there would empty
 * the categories.
 *
 * Edit this list to taste: it is the single source of truth for "known brand".
 */

/** Global apparel/footwear/accessory brands sold on both amazon.in and .com. */
const GLOBAL_BRANDS = [
  "adidas", "aldo", "aldo shoes", "allen solly", "american eagle", "armani exchange",
  "asics", "bata", "benetton", "birkenstock", "boss", "calvin klein", "casio",
  "champion", "charles & keith", "clarks", "columbia", "converse", "crocs",
  "diesel", "dockers", "dr martens", "esprit", "fila", "fossil", "gant", "gap",
  "guess", "gucci", "hm", "h&m", "hush puppies", "jack & jones", "jansport",
  "kipling", "lacoste", "lee", "levi's", "levis", "mango", "michael kors",
  "new balance", "nike", "north face", "the north face", "only", "pepe jeans",
  "polo ralph lauren", "puma", "quiksilver", "ray-ban", "rayban", "reebok",
  "salomon", "samsonite", "sketchers", "skechers", "steve madden", "superdry",
  "swiss military", "timberland", "titan", "tommy hilfiger", "under armour",
  "vans", "vero moda", "wildcraft", "wrangler", "zara", "marks & spencer",
  "lee cooper", "celio", "jockey", "crocs", "hummel", "geox", "ecco", "aldo",
  "furla", "coach", "daniel wellington", "seiko", "titan raga", "oakley",
] as const;

/** Brands that matter on amazon.in specifically (Indian labels + Amazon's own). */
const IN_BRANDS = [
  "aurelia", "biba", "campus", "chemistry", "fabindia", "flying machine",
  "forever new", "global desi", "hidesign", "indian terrain", "jaipur kurti",
  "killer", "lakme", "libas", "louis philippe", "max fashion", "metro shoes",
  "mochi", "monte carlo", "park avenue", "peter england", "raymond", "red tape",
  "sangria", "soch", "sparx", "spykar", "the souled store", "us polo assn",
  "arrow", "blackberrys", "colorplus", "john players", "numero uno", "snitch",
  "bewakoof", "roadster", "here&now", "dennis lingo", "highlander", "urbano",
  "catwalk", "inc.5", "marc loire", "truffle collection", "lavie", "caprese",
  "baggit", "liberty", "relaxo", "khadims", "paragon",
  "twenty dresses", "kazo", "vishudh", "anouk", "rangriti",
  "u.s. polo assn", "van heusen", "vishudh", "w for woman", "westside",
  "woodland", "symbol", "amazon brand", "van heusen woman",
] as const;

/** Brands that matter on amazon.com specifically. */
const US_BRANDS = [
  "abercrombie", "aeropostale", "amazon essentials", "banana republic",
  "brooks brothers", "carhartt", "cole haan", "dickies", "eddie bauer",
  "fruit of the loom", "goodthreads", "hanes", "j.crew", "jcrew", "kate spade",
  "lands' end", "lucky brand", "madewell", "nautica", "old navy", "patagonia",
  "sam edelman", "sketchers", "sperry", "tommy john", "van heusen", "wrangler",
] as const;

const ALL_BRANDS = [...new Set([...GLOBAL_BRANDS, ...IN_BRANDS, ...US_BRANDS])];

/** Longest-first so "polo ralph lauren" wins over a bare "polo" style prefix. */
const SORTED_BRANDS = [...ALL_BRANDS].sort((a, b) => b.length - a.length);

/** Amazon titles come back HTML-escaped ("Levi&#x27;s Women&#x27;s ..."), and an
 *  undecoded entity turns the brand into "levi& x27 s", which matches nothing. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&quot;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function normalize(text: string): string {
  // Collapse punctuation the way listings vary it: "Levi's" / "Levis",
  // "U.S. Polo Assn." / "US Polo Assn".
  return ` ${decodeEntities(text).toLowerCase().replace(/[^a-z0-9&]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

const NORMALIZED_BRANDS = SORTED_BRANDS.map((b) => ({
  brand: b,
  needle: normalize(b),
}));

/**
 * The known brand named in a listing title (or explicit brand field), or null.
 * Amazon search rarely returns a `brand` field, so the title is the real signal
 * — and virtually every branded listing leads with the brand name.
 */
export function matchKnownBrand(title: string, brandField?: string): string | null {
  const hayTitle = normalize(title || "");
  const hayBrand = brandField ? normalize(brandField) : "";
  for (const { brand, needle } of NORMALIZED_BRANDS) {
    if (hayBrand && hayBrand.includes(needle)) return brand;
    if (hayTitle.includes(needle)) return brand;
  }
  return null;
}

export function isKnownBrand(title: string, brandField?: string): boolean {
  return matchKnownBrand(title, brandField) !== null;
}

/** A prompt-ready sample of the list, so the stylist writes queries we can match. */
export function brandHintForPrompt(locale: "IN" | "US"): string {
  const list = locale === "IN"
    ? ["Levi's", "Van Heusen", "Allen Solly", "Louis Philippe", "Peter England", "US Polo Assn", "Puma", "Adidas", "Nike", "Biba", "W for Woman", "Vero Moda", "ONLY", "Zara", "Bata", "Woodland", "Red Tape", "Titan", "Fossil", "Hidesign", "Wildcraft", "Ray-Ban", "Fabindia", "Max Fashion", "The Souled Store"]
    : ["Levi's", "Calvin Klein", "Tommy Hilfiger", "Ralph Lauren", "Nike", "Adidas", "New Balance", "Clarks", "Cole Haan", "Steve Madden", "Michael Kors", "Kate Spade", "Fossil", "Ray-Ban", "Gap", "Old Navy", "Madewell", "Patagonia", "The North Face", "Amazon Essentials"];
  return list.join(", ");
}
