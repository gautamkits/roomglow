# Event prompts

**Generated file — do not edit by hand.** Run `npm run docs:events` after changing `src/lib/events.ts`.

Every event runs through the same four AI steps. Only the *event brief* below differs per event — the pipeline prompts themselves are shared and live in `src/lib/gemini.ts`.

| Step | Function | What it does |
| --- | --- | --- |
| 1 | `analyzeRoom` | Reads the photo. Picks `venueKind`, a `stagingPlan` (indoor only), suggested items, and what is worth clearing. |
| 2 | `recommendProducts` | Turns chosen item types into categories, Amazon search queries and placements. |
| 3 | `curateProducts` | Picks one product per category so the set looks cohesive. |
| 4 | `generateDesignImage` | Renders the room with the products composited in. |

## The event brief

Built by `buildEventContext()` in `src/lib/events.ts` and threaded into every step above. A string here vs `undefined` **is** the event-vs-space branch.

```
This space will host a {promptLabel} with a "{subTheme}" theme using a {colorScheme} color scheme.{gender}{honoree} All signage and décor must match a {promptLabel} — never a different occasion, and never another country's version of the same-named holiday.
```

`promptLabel` overrides the user-facing `label` where the label is ambiguous across markets — e.g. "Independence Day" means different things in IN and US, and the label lands verbatim in the Amazon search query.

---

## Events (24)

### 🎂 Birthday

`birthday` — IN + US · gendered

**Themes:** Jungle, Unicorn, Superhero, Cars, Minimal, Floral

**Colours:** Pastel, Bright & bold, Gold & white, Rainbow

**Example brief:**

> This space will host a Birthday with a "Jungle" theme using a Pastel color scheme. All signage and décor must match a Birthday — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Gift — `birthday gift`
- Party tableware — `birthday party tableware set`
- Snacks — `party snacks pack`
- Cake topper — `birthday cake topper`
- Return favors — `return gift party favors`
- Candles — `birthday number candles`

---

### 💛 Anniversary

`anniversary` — IN + US

**Themes:** Romantic red, Golden 25th, Garden, Minimal

**Colours:** Red & gold, Rose & white, Burgundy, Gold & white

**Example brief:**

> This space will host a Anniversary with a "Romantic red" theme using a Red & gold color scheme. All signage and décor must match a Anniversary — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Gift — `anniversary gift`
- Flowers — `rose bouquet`
- Chocolates — `chocolate gift box`
- Wine glasses — `wine glasses set`
- Photo frame — `couple photo frame`

---

### 🍼 Baby shower

`baby_shower` — IN + US · gendered · one-time

**Themes:** Boy blue, Girl pink, Neutral, Woodland, Cloud & stars

**Colours:** Blue & white, Pink & white, Sage & cream, Pastel mix

**Example brief:**

> This space will host a Baby shower with a "Boy blue" theme using a Blue & white color scheme. All signage and décor must match a Baby shower — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Baby gift — `baby gift set`
- Shower games — `baby shower games`
- Guest book — `baby shower guest book`
- Diaper cake — `diaper cake`
- Party favors — `baby shower party favors`

---

### 🍚 Annaprasan

`annaprasan` — IN · gendered

**Themes:** Traditional, Floral marigold, Pastel, Royal

**Colours:** Marigold & red, Pastel pink, Gold & maroon, Green & yellow

**Example brief:**

> This space will host a Annaprasan with a "Traditional" theme using a Marigold & red color scheme. All signage and décor must match a Annaprasan — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Silver gift — `silver gift for baby`
- Keepsake — `baby footprint keepsake`
- Sweets — `indian sweets gift box`
- Baby outfit — `baby traditional dress`
- Return gifts — `pooja return gifts`

---

### 🪔 Diwali

`diwali` — IN

**Themes:** Traditional diya, Rangoli, Royal, Modern minimal, Floral

**Colours:** Marigold & red, Gold & maroon, Purple & gold, Pink & orange

**Example brief:**

> This space will host a Diwali with a "Traditional diya" theme using a Marigold & red color scheme. All signage and décor must match a Diwali — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Sweets — `diwali sweets box`
- Diyas — `diya set decorative`
- Dry fruits — `dry fruits gift pack`
- Gift hamper — `diwali gift hamper`
- Pooja thali — `pooja thali set`
- Lights — `led string lights`

---

### 🪁 Makar Sankranti

`makar_sankranti` — IN

**Themes:** Kite theme, Traditional, Floral marigold, Rustic harvest

**Colours:** Yellow & orange, Marigold & red, Green & yellow, Pastel

**Example brief:**

> This space will host a Makar Sankranti with a "Kite theme" theme using a Yellow & orange color scheme. All signage and décor must match a Makar Sankranti — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Kites — `kite set with manjha`
- Sweets — `til gud chikki gift box`
- Sesame treats — `tilkut sweets`
- Rangoli — `rangoli stencil kit`
- Return gifts — `festival return gifts`

---

### 🇮🇳 Republic Day

`republic_day` — IN

**Themes:** Tricolour, Patriotic, Modern minimal, Floral

**Colours:** Saffron, white & green, Tricolour & gold, Navy & white

**Example brief:**

> This space will host a Republic Day with a "Tricolour" theme using a Saffron, white & green color scheme. All signage and décor must match a Republic Day — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Flags — `indian flag tricolour`
- Decorations — `tricolour party decorations`
- Balloons — `tricolour balloons`
- Badges — `tricolour flag badges`
- Sweets — `indian sweets gift box`

---

### 🎨 Holi

`holi` — IN

**Themes:** Colour splash, Floral, Traditional, Modern minimal, Rustic

**Colours:** Rainbow, Pink & yellow, Bright & bold, Pastel mix

**Example brief:**

> This space will host a Holi with a "Colour splash" theme using a Rainbow color scheme. All signage and décor must match a Holi — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Colours — `herbal holi gulal colours`
- Water guns — `holi pichkari water gun`
- Sweets — `gujiya sweets gift box`
- Thandai — `thandai mix`
- Return gifts — `holi return gifts`

---

### 🌙 Eid al-Fitr

`eid` — IN

**Themes:** Crescent & lantern, Royal, Floral, Modern minimal, Traditional

**Colours:** Green & gold, Teal & gold, Royal blue & silver, Ivory & gold

**Example brief:**

> This space will host a Eid al-Fitr with a "Crescent & lantern" theme using a Green & gold color scheme. All signage and décor must match a Eid al-Fitr — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Gift — `eid gift set`
- Sweets — `eid sweets gift box`
- Dates — `premium dates gift pack`
- Lantern — `ramadan lantern decor`
- Dry fruits — `dry fruits gift pack`

---

### 🪢 Raksha Bandhan

`raksha_bandhan` — IN

**Themes:** Traditional, Floral, Royal, Modern minimal

**Colours:** Marigold & red, Pink & gold, Gold & maroon, Pastel

**Example brief:**

> This space will host a Raksha Bandhan with a "Traditional" theme using a Marigold & red color scheme. All signage and décor must match a Raksha Bandhan — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Rakhi — `designer rakhi set`
- Gift for sister — `rakhi gift for sister`
- Gift for brother — `rakhi gift for brother`
- Sweets — `indian sweets gift box`
- Chocolates — `chocolate gift box`

---

### 🇮🇳 Independence Day

`independence_day_in` — IN · has promptLabel

**Sent to the model as:** Indian Independence Day (15 August, tricolour / desh bhakti)

**Themes:** Tricolour, Patriotic, Modern minimal, Floral

**Colours:** Saffron, white & green, Tricolour & gold, Navy & white

**Example brief:**

> This space will host a Indian Independence Day (15 August, tricolour / desh bhakti) with a "Tricolour" theme using a Saffron, white & green color scheme. All signage and décor must match a Indian Independence Day (15 August, tricolour / desh bhakti) — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Flags — `indian flag tricolour`
- Decorations — `tricolour party decorations`
- Balloons — `tricolour balloons`
- Badges — `tricolour flag badges`
- Sweets — `indian sweets gift box`

---

### 🦚 Janmashtami

`janmashtami` — IN

**Themes:** Traditional, Floral, Royal, Jhula / cradle

**Colours:** Peacock blue & gold, Marigold & red, Yellow & green, Gold & maroon

**Example brief:**

> This space will host a Janmashtami with a "Traditional" theme using a Peacock blue & gold color scheme. All signage and décor must match a Janmashtami — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Krishna idol — `laddu gopal idol`
- Jhula — `krishna jhula cradle`
- Flute — `decorative bansuri flute`
- Sweets — `makhan mishri sweets`
- Decorations — `janmashtami decoration items`

---

### 🐘 Ganesh Chaturthi

`ganesh_chaturthi` — IN

**Themes:** Traditional, Floral marigold, Royal, Modern minimal, Eco-friendly

**Colours:** Marigold & red, Gold & maroon, Red & yellow, Green & gold

**Example brief:**

> This space will host a Ganesh Chaturthi with a "Traditional" theme using a Marigold & red color scheme. All signage and décor must match a Ganesh Chaturthi — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Ganesh idol — `eco friendly ganesh idol`
- Decorations — `ganpati decoration items`
- Modak mould — `modak mould`
- Sweets — `modak sweets box`
- Pooja kit — `pooja samagri kit`

---

### 🪘 Navratri / Durga Puja

`navratri` — IN

**Themes:** Garba / dandiya, Traditional, Floral, Royal, Modern minimal

**Colours:** Marigold & red, Bright & bold, Rainbow, Gold & maroon

**Example brief:**

> This space will host a Navratri / Durga Puja with a "Garba / dandiya" theme using a Marigold & red color scheme. All signage and décor must match a Navratri / Durga Puja — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Dandiya — `dandiya sticks decorated`
- Decorations — `navratri decoration items`
- Torans — `marigold toran door hanging`
- Sweets — `indian sweets gift box`
- Pooja kit — `pooja samagri kit`

---

### 🏹 Dussehra

`dussehra` — IN

**Themes:** Traditional, Floral marigold, Royal, Modern minimal

**Colours:** Marigold & red, Gold & maroon, Red & yellow, Green & gold

**Example brief:**

> This space will host a Dussehra with a "Traditional" theme using a Marigold & red color scheme. All signage and décor must match a Dussehra — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Decorations — `dussehra decoration items`
- Torans — `marigold toran door hanging`
- Sweets — `indian sweets gift box`
- Pooja kit — `pooja samagri kit`
- Return gifts — `festival return gifts`

---

### 🏡 Housewarming

`housewarming` — IN + US · one-time

**Themes:** Traditional, Floral, Modern minimal, Festive

**Colours:** Marigold & red, Pastel, Gold & white, Green & yellow

**Example brief:**

> This space will host a Housewarming with a "Traditional" theme using a Marigold & red color scheme. All signage and décor must match a Housewarming — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Gift — `housewarming gift`
- Indoor plant — `indoor plant`
- Pooja kit — `pooja samagri kit`
- Scented candles — `scented candle set`
- Doormat — `welcome doormat`

---

### 🎃 Halloween

`halloween` — US

**Themes:** Spooky, Haunted house, Pumpkin patch, Witch, Cute / kids

**Colours:** Orange & black, Purple & green, Black & gold, Neon

**Example brief:**

> This space will host a Halloween with a "Spooky" theme using a Orange & black color scheme. All signage and décor must match a Halloween — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Candy — `halloween candy`
- Costume — `halloween costume`
- Treat bags — `trick or treat bags`
- Props — `halloween props`
- Party tableware — `halloween party tableware`

---

### 🦃 Thanksgiving

`thanksgiving` — US

**Themes:** Rustic harvest, Modern fall, Farmhouse, Floral autumn

**Colours:** Burnt orange & brown, Gold & cream, Deep red & amber, Sage & wheat

**Example brief:**

> This space will host a Thanksgiving with a "Rustic harvest" theme using a Burnt orange & brown color scheme. All signage and décor must match a Thanksgiving — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Serveware — `thanksgiving serving platter`
- Table linens — `fall table runner`
- Hostess gift — `hostess gift`
- Pie dish — `pie baking dish`
- Candles — `fall scented candles`

---

### 🎄 Christmas

`christmas` — IN + US

**Themes:** Classic red & green, Winter wonderland, Rustic, Modern minimal, Nordic

**Colours:** Red & green, Gold & white, Silver & blue, Frosted neutral

**Example brief:**

> This space will host a Christmas with a "Classic red & green" theme using a Red & green color scheme. All signage and décor must match a Christmas — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Gifts — `christmas gift`
- Ornaments — `christmas ornaments`
- Stockings — `christmas stockings`
- Wrapping paper — `christmas wrapping paper`
- Treats — `christmas chocolate gift`
- Lights — `christmas string lights`

---

### 🐰 Easter

`easter` — US

**Themes:** Pastel spring, Floral, Bunny & eggs, Garden brunch

**Colours:** Pastel mix, Lavender & mint, Pink & yellow, Blue & white

**Example brief:**

> This space will host a Easter with a "Pastel spring" theme using a Pastel mix color scheme. All signage and décor must match a Easter — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Easter basket — `easter basket`
- Candy — `easter candy`
- Egg decorating kit — `easter egg decorating kit`
- Kids gift — `easter gift for kids`
- Party tableware — `easter party tableware`

---

### 🎆 4th of July

`independence_day` — US

**Themes:** Classic patriotic, Backyard BBQ, Modern stars & stripes, Rustic

**Colours:** Red, white & blue, Navy & gold, Vintage Americana

**Example brief:**

> This space will host a 4th of July with a "Classic patriotic" theme using a Red, white & blue color scheme. All signage and décor must match a 4th of July — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Party tableware — `4th of july party tableware`
- Flags — `american flags`
- BBQ tools — `bbq grill tools`
- Snacks — `party snacks pack`
- Decorations — `patriotic party supplies`

---

### ❤️ Valentine's Day

`valentines` — IN + US

**Themes:** Romantic, Floral, Modern minimal, Galentine's

**Colours:** Red & pink, Blush & gold, Burgundy, White & rose

**Example brief:**

> This space will host a Valentine's Day with a "Romantic" theme using a Red & pink color scheme. All signage and décor must match a Valentine's Day — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Gift — `valentine gift`
- Flowers — `red roses bouquet`
- Chocolates — `chocolate gift box`
- Card — `valentine greeting card`
- Jewelry — `valentine jewelry gift`
- Soft toy — `teddy bear gift`

---

### 🎉 New Year's Eve

`new_year` — IN + US

**Themes:** Gold glam, Black tie, Confetti party, Minimal chic

**Colours:** Black & gold, Silver & white, Rose gold, Midnight blue

**Example brief:**

> This space will host a New Year's Eve with a "Gold glam" theme using a Black & gold color scheme. All signage and décor must match a New Year's Eve — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Party supplies — `new years eve party supplies`
- Champagne flutes — `champagne flutes set`
- Party hats — `new year party hats`
- Confetti poppers — `confetti poppers`
- Balloons — `new year balloons`

---

### 🎓 Graduation

`graduation` — IN + US

**Themes:** Classic, Modern, Floral, Bold

**Colours:** Black & gold, School colors, Navy & silver, Pastel

**Example brief:**

> This space will host a Graduation with a "Classic" theme using a Black & gold color scheme. All signage and décor must match a Graduation — never a different occasion, and never another country's version of the same-named holiday.

**"Complete the occasion" searches** (shop grid only — never rendered into the design):

- Gift — `graduation gift`
- Party supplies — `graduation party supplies`
- Photo props — `graduation photo props`
- Flowers — `graduation flower bouquet`
- Card — `graduation card`
- Convocation sash — `convocation graduation stole`

---
