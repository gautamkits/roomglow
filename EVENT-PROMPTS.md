# Event prompts — exact text sent to Gemini

**Generated file — do not edit by hand.** Run `npm run docs:events`.

Captured by stubbing `fetch` and running the real pipeline functions, so this is the literal request body, not a transcription.

Interpolated values below come from one representative case: a **Birthday / Floral / Pastel** event in an 11×10ft cluttered living room. Only the *event brief* changes per event — see Part 2.

---

## Part 1 — the pipeline

| Step | Function | Model | Prompt below |
| --- | --- | --- | --- |
| 1 | `analyzeRoom` | `gemini-2.5-flash` | [§1.1 event](#11-analyzeroom--event) / [§1.2 space](#12-analyzeroom--space) |
| 2 | `recommendProducts` | `gemini-2.5-flash` | [§2.1 indoor](#21-recommendproducts--indoor-event) / [§2.2 outdoor](#22-recommendproducts--outdoor-event) |
| 3 | `curateProducts` | `gemini-2.5-flash` | [§3](#3-curateproducts) |
| 4 | `generateDesignImage` | `gemini-3.1-flash-image` | [§4](#4-generatedesignimage) |
| 4b | `detectHotspots` | `gemini-2.5-flash` | [§5](#5-detecthotspots) |
| — | `emptyRoom` (tidy-up pre-pass) | `gemini-3.1-flash-image` | [§6](#6-emptyroom) |
| — | `editDesignImage` (admin) | `gemini-3.1-flash-image` | [§7](#7-editdesignimage) |

Three behaviours are deliberately distinct: **space** redesigns, **indoor** events (focal staging), and **outdoor** events (pre-staging logic). `analyzeRoom` picks `venueKind`, and `enforceVenueBranch` strips `stagingPlan` for outdoor so every later step reverts on its own.

---

## Part 2 — the event brief

Built by `buildEventContext()` (`src/lib/events.ts`) and threaded into steps 1, 2 and 4. **This is the only text that differs per event.**

```text
This space will host a {promptLabel} with a "{subTheme}" theme using a {colorScheme} color scheme.{gender}{honoree} All signage and décor must match a {promptLabel} — never a different occasion, and never another country's version of the same-named holiday.
```

### All 24 events

| Event | id | Markets | Sent to model as | Themes | Colours |
| --- | --- | --- | --- | --- | --- |
| 🎂 Birthday | `birthday` | IN, US | Birthday | Jungle, Unicorn, Superhero, Cars, Minimal, Floral | Pastel, Bright & bold, Gold & white, Rainbow |
| 💛 Anniversary | `anniversary` | IN, US | Anniversary | Romantic red, Golden 25th, Garden, Minimal | Red & gold, Rose & white, Burgundy, Gold & white |
| 🍼 Baby shower | `baby_shower` | IN, US | Baby shower | Boy blue, Girl pink, Neutral, Woodland, Cloud & stars | Blue & white, Pink & white, Sage & cream, Pastel mix |
| 🍚 Annaprasan | `annaprasan` | IN | Annaprasan | Traditional, Floral marigold, Pastel, Royal | Marigold & red, Pastel pink, Gold & maroon, Green & yellow |
| 🪔 Diwali | `diwali` | IN | Diwali | Traditional diya, Rangoli, Royal, Modern minimal, Floral | Marigold & red, Gold & maroon, Purple & gold, Pink & orange |
| 🪁 Makar Sankranti | `makar_sankranti` | IN | Makar Sankranti | Kite theme, Traditional, Floral marigold, Rustic harvest | Yellow & orange, Marigold & red, Green & yellow, Pastel |
| 🇮🇳 Republic Day | `republic_day` | IN | Republic Day | Tricolour, Patriotic, Modern minimal, Floral | Saffron, white & green, Tricolour & gold, Navy & white |
| 🎨 Holi | `holi` | IN | Holi | Colour splash, Floral, Traditional, Modern minimal, Rustic | Rainbow, Pink & yellow, Bright & bold, Pastel mix |
| 🌙 Eid al-Fitr | `eid` | IN | Eid al-Fitr | Crescent & lantern, Royal, Floral, Modern minimal, Traditional | Green & gold, Teal & gold, Royal blue & silver, Ivory & gold |
| 🪢 Raksha Bandhan | `raksha_bandhan` | IN | Raksha Bandhan | Traditional, Floral, Royal, Modern minimal | Marigold & red, Pink & gold, Gold & maroon, Pastel |
| 🇮🇳 Independence Day | `independence_day_in` | IN | Indian Independence Day (15 August, tricolour / desh bhakti) | Tricolour, Patriotic, Modern minimal, Floral | Saffron, white & green, Tricolour & gold, Navy & white |
| 🦚 Janmashtami | `janmashtami` | IN | Janmashtami | Traditional, Floral, Royal, Jhula / cradle | Peacock blue & gold, Marigold & red, Yellow & green, Gold & maroon |
| 🐘 Ganesh Chaturthi | `ganesh_chaturthi` | IN | Ganesh Chaturthi | Traditional, Floral marigold, Royal, Modern minimal, Eco-friendly | Marigold & red, Gold & maroon, Red & yellow, Green & gold |
| 🪘 Navratri / Durga Puja | `navratri` | IN | Navratri / Durga Puja | Garba / dandiya, Traditional, Floral, Royal, Modern minimal | Marigold & red, Bright & bold, Rainbow, Gold & maroon |
| 🏹 Dussehra | `dussehra` | IN | Dussehra | Traditional, Floral marigold, Royal, Modern minimal | Marigold & red, Gold & maroon, Red & yellow, Green & gold |
| 🏡 Housewarming | `housewarming` | IN, US | Housewarming | Traditional, Floral, Modern minimal, Festive | Marigold & red, Pastel, Gold & white, Green & yellow |
| 🎃 Halloween | `halloween` | US | Halloween | Spooky, Haunted house, Pumpkin patch, Witch, Cute / kids | Orange & black, Purple & green, Black & gold, Neon |
| 🦃 Thanksgiving | `thanksgiving` | US | Thanksgiving | Rustic harvest, Modern fall, Farmhouse, Floral autumn | Burnt orange & brown, Gold & cream, Deep red & amber, Sage & wheat |
| 🎄 Christmas | `christmas` | IN, US | Christmas | Classic red & green, Winter wonderland, Rustic, Modern minimal, Nordic | Red & green, Gold & white, Silver & blue, Frosted neutral |
| 🐰 Easter | `easter` | US | Easter | Pastel spring, Floral, Bunny & eggs, Garden brunch | Pastel mix, Lavender & mint, Pink & yellow, Blue & white |
| 🎆 4th of July | `independence_day` | US | 4th of July | Classic patriotic, Backyard BBQ, Modern stars & stripes, Rustic | Red, white & blue, Navy & gold, Vintage Americana |
| ❤️ Valentine's Day | `valentines` | IN, US | Valentine's Day | Romantic, Floral, Modern minimal, Galentine's | Red & pink, Blush & gold, Burgundy, White & rose |
| 🎉 New Year's Eve | `new_year` | IN, US | New Year's Eve | Gold glam, Black tie, Confetti party, Minimal chic | Black & gold, Silver & white, Rose gold, Midnight blue |
| 🎓 Graduation | `graduation` | IN, US | Graduation | Classic, Modern, Floral, Bold | Black & gold, School colors, Navy & silver, Pastel |

`promptLabel` overrides the user-facing label where it is ambiguous across markets — "Independence Day" means different things in IN and US, and it lands verbatim in the Amazon search query.

---

## Part 3 — exact prompts

### 1.1 analyzeRoom — event

*Model: `gemini-2.5-flash` · 1 image attached*

```text
You are an event decoration planner. This space will host a Birthday with a "Floral" theme using a Pastel color scheme. All signage and décor must match a Birthday — never a different occasion, and never another country's version of the same-named holiday.

Analyze this photo of the space where the event will be held. Note the existing surfaces and zones.

Fill in:
- roomType: the kind of space (e.g. "living room", "hall", "backyard")
- currentStyle: the current look of the space
- dimensions: "small" | "medium" | "large"
- geometry: estimate the REAL size of the space in feet. Use objects with known typical sizes as rulers — an interior door is ~6.7 ft tall, a 3-seat sofa ~6 ft wide, a dining table ~2.5 ft tall, a light switch ~4 ft above the floor. Provide:
  - approxWidthFt / approxDepthFt: the visible floor area's width and depth in feet
  - approxCeilingFt: floor-to-ceiling height in feet
  - scaleReferences: 1-3 visible objects you used as rulers, each with its assumed size (e.g. "door on left wall (~6.7 ft tall)", "dining table (~2.5 ft tall)")
  Be conservative: if unsure, estimate SMALLER rather than larger.
- existingFurniture: key furniture/surfaces you see (sofa, table, wall, etc.)
- lightingCondition: "bright" | "moderate" | "dim"
- colorPalette: 3 hex colors representing the space
- venueKind: "indoor" or "outdoor". Decide this FIRST, because it changes the rest of your answer.
  - "indoor": an enclosed room or hall — walls you can decorate, a ceiling, ordinary domestic or hall scale.
  - "outdoor": open-air or open ground — school ground or campus, garden, lawn, park, terrace, rooftop, courtyard, poolside, farmhouse, driveway, street. ALSO use "outdoor" for any space so large and open that it reads as a ground or arena rather than a room, even if technically covered (e.g. a pandal, a shamiana, an open pavilion, a large covered stage area).
  - When genuinely torn, choose "outdoor". Concentrating everything in one spot looks worse in a big open space than spreading out does in a small one.

════ IF venueKind is "indoor", follow THESE rules ════
- stagingPlan: FIRST decide where the decoration goes, before choosing any item.
  - focalZone: the ONE area this design is built around, described so it can be found in the photo (e.g. "the wall behind the television console"). Pick the largest, most visible, least obstructed surface that a guest looking into the room would face. A decoration concentrated in one place reads as designed; the same items spread around a room read as mess.
  - focalReason: one sentence on why that area won.
  - supportingZones: AT MOST 2 further areas that get a light accent. May be empty. Never more than 2.
- suggestedProducts: EVENT DECORATION items, count scaled to the space:
  - 3-4 items if dimensions is "small" OR clutterLevel is "cluttered"
  - 5-6 items if dimensions is "medium" and clutterLevel is "moderate"
  - 6-8 items ONLY if the space is large and clutterLevel is "clean"
  A small or busy room needs fewer, bigger gestures — never more items to compete with what is already there.

════ IF venueKind is "outdoor", follow THESE rules INSTEAD ════
- stagingPlan: OMIT this field entirely. An open ground has no single wall a guest faces, so there is no focal zone to build on and forcing one looks wrong.
- suggestedProducts: 6-8 items. An open venue has room for several separate decorated moments — an entrance or gateway, a stage or backdrop area, seating, pathways, perimeter — so items SHOULD be distributed across the space rather than concentrated in one spot.
- Anchor décor to real structures you can see: existing poles, trees, walls, railings, gates, stage, canopy frame, tables. Never float anything in open ground with nothing supporting it.
- Do not set "effort", "blocksFocal" or "clearReason" on removableObjects — there is no focal zone for them to relate to.
════ END of the venueKind branch ════
- clutterLevel: "clean" if the space is empty or nearly so, "moderate" if it has some furniture/objects, "cluttered" if it is full of items that would crowd the decorations
- removableObjects: everything the occupant could physically shift out of the way before the event — substantial furniture and large décor (sofa, table, chairs, shelving unit, rug, large lamp, large plant, cabinet/console), AND lighter movable things that crowd the space or sit on a wall (bean bag, floor cushions, ride-on toy, laundry basket, drying rack, framed picture, wall hanging, hanging plant, clock, mirror). EXCLUDE only permanent architecture (walls, floor, ceiling, windows, doors, built-ins) and loose tabletop clutter (remotes, bottles, cups, food, papers, chargers), which is tidied away automatically. Each entry has:
  - "id": short snake_case identifier
  - "label": human name
  - "restsOn": the "id" of the object it sits on, if any (e.g. a centerpiece on a table), so clearing never leaves it floating
  - "effort": how hard it is for ONE person to move it before a party —
    - "trivial": lift or unhook in seconds (bean bag, cushions, toys, baskets, framed picture, wall hanging, small plant, clock)
    - "moderate": one person can slide or carry it (armchair, side table, floor lamp, small rug, drying rack)
    - "heavy": needs two people or real effort (sofa, large TV unit, bed, wardrobe, dining table, large rug)
  - "blocksFocal": true if this object sits in, covers, or visually competes with the stagingPlan focalZone. A picture frame or wall hanging in the middle of the chosen backdrop wall is the clearest case — mark it true. Be honest here even for "heavy" objects: if a sofa or TV unit genuinely occupies the focal zone, say so.
  - "clearReason": one short sentence, addressed to the occupant, on what clearing it buys — e.g. "Frees the backdrop wall for the balloon arch." Only needed when effort is "trivial" or blocksFocal is true.

CRITICAL RULES for suggestedProducts:
- Suggest ONLY event DECORATIONS appropriate to the occasion and theme — NOT permanent furniture
- ONLY suggest decorations that fit a surface VISIBLE in THIS photo. Never invent a surface, and never suggest something that needs one the photo does not show:
  - NEVER suggest ceiling-hung décor of ANY kind — no hanging lanterns, swirls, danglers, pom-poms, streamers from the ceiling, or ceiling balloons. Wall, floor and table décor ONLY. This rule is absolute: apply it even if the ceiling or a ceiling fan appears visible.
  - Do NOT suggest a table centerpiece, dessert-table or cake-table decor unless a table is clearly visible. Never invent a table, dessert stand or cake table that is not already in the photo.
  - Do NOT suggest a full-wall backdrop unless a clear, largely unobstructed wall is visible — otherwise suggest a smaller banner sized to the wall space that actually exists
  - Do NOT suggest anything requiring structural changes, new fixtures, or rearranging the room
- INDOOR ONLY — BUILD ONE COMPOSITION, do not sprinkle. At least HALF the items must belong to the stagingPlan focalZone and work together there as a single arrangement (e.g. backdrop + balloons + a sign on the same wall). The remainder go to the supportingZones. Never place items in an area that is neither the focal zone nor a supporting zone.
- INDOOR ONLY — Do NOT stack more than 2 items on any single surface. Three things on one console is clutter, not styling.
- INDOOR ONLY — You MAY assume the objects worth clearing (see removableObjects) are gone; design for the room once the focal zone is clear, not around the mess.
- OUTDOOR ONLY — spread the items across the venue's natural areas (entrance, stage/backdrop, seating, perimeter, pathways). Do NOT concentrate them in one spot, and do NOT reference a focal zone; there isn't one.
- Examples, but only where the matching surface is visible: balloon sets/arches, themed backdrop or banner, fairy/string lights, table centerpiece, garlands, themed props, cake-table decor, welcome sign
- Match the theme and colors specified above
- Each "description" must name which zone the item belongs to (e.g. "balloon arch for the focal wall behind the TV console")
- "icon" is a single relevant emoji character
- "id" is a short snake_case identifier
```

### 1.2 analyzeRoom — space

For contrast. Space is a separate branch and must not be changed without an explicit request (see CLAUDE.md).

*Model: `gemini-2.5-flash` · 1 image attached*

```text
You are an interior design analyst. Carefully analyze this room photo. Pay close attention to what ACTUALLY exists in the room — the furniture, walls, windows (or lack of), floors, lighting fixtures, etc.

Fill in:
- roomType: "living room" | "bedroom" | "kitchen" | etc
- currentStyle: "modern" | "traditional" | "minimalist" | etc
- dimensions: "small" | "medium" | "large"
- geometry: estimate the REAL size of the room in feet. Use objects with known typical sizes as rulers — an interior door is ~6.7 ft tall, a 3-seat sofa ~6 ft wide, a light switch ~4 ft above the floor, a bed ~6.3 ft long. Provide:
  - approxWidthFt / approxDepthFt: the visible floor area's width and depth in feet
  - approxCeilingFt: floor-to-ceiling height in feet
  - scaleReferences: 1-3 visible objects you used as rulers, each with its assumed size (e.g. "door on left wall (~6.7 ft tall)", "3-seat sofa (~6 ft wide)")
  Be conservative: if unsure, estimate SMALLER rather than larger.
- existingFurniture: array of items you actually see
- lightingCondition: "bright" | "moderate" | "dim"
- colorPalette: 3 hex colors representing the room
- suggestedProducts: 6-8 products
- clutterLevel: "clean" if the room is empty or nearly so (good blank canvas), "moderate" if it has some furniture/objects, "cluttered" if it is full of furniture and items that would crowd a new design
- removableObjects: ONLY the LARGE, MAIN movable pieces the user might realistically want to remove or replace — substantial furniture and large décor (e.g. sofa, bed, dining/coffee table, chairs, shelving unit, rug, large floor lamp, large potted plant, cabinet/console, TV). Each has a short snake_case "id" and a human "label". EXCLUDE permanent architecture (walls, floor, ceiling, windows, doors, built-in cabinetry) AND all small clutter / tabletop items (remotes, bottles, cups, thermos, food/fruit, books, papers, chargers, cushions, small decor and any loose small object) — those are tidied away automatically and must NOT be listed. If a listed large object rests on another listed object, set "restsOn" to that supporting object's "id" (e.g. a lamp on a side table, a TV on a console). Return an empty array only if there are no large movable pieces.

CRITICAL RULES for suggestedProducts:
- Suggest products that can REALISTICALLY be added to THIS room
- ONLY suggest products that make sense for what you see:
  - Do NOT suggest curtains/drapes if there are NO windows visible
  - Do NOT suggest a new sofa/couch if one already exists
  - Do NOT suggest items that would require structural changes
- Focus on ADDITIVE items: wall art for bare walls, rugs for bare floors, lamps for dim areas, side tables for empty corners, throw pillows for existing furniture, plants for empty spots, shelves for storage
- Each "description" must reference what you ACTUALLY see in the photo
- "icon" is a single relevant emoji character
- "id" is a short snake_case identifier
```

### 2.1 recommendProducts — indoor event

*Model: `gemini-2.5-flash` · 0 images attached*

```text
You are an expert event decorator. This space will host a Birthday with a "Floral" theme using a Pastel color scheme. All signage and décor must match a Birthday — never a different occasion, and never another country's version of the same-named holiday.

Based on the space analysis and the requested items below, create a decoration vision and recommend specific DECORATION products to style this space for the event.

Space Analysis:
- Type: living room
- Current Style: modern Indian family home
- Size: medium
- Existing Furniture/Surfaces: television, television stand, wooden bed frame
- Lighting: moderate
- Current Colors: #e8ded2, #8a6b4f, #3b3b3b
- FOCAL ZONE (the design is built here): the wall behind the television console — It is the largest unobstructed wall a guest entering the room faces.
- SUPPORTING ZONES (light accents only): the television console top

The user has specifically requested these item types: Balloon arch kit. You MUST include one product for each of these types. You may suggest additional complementary items if needed.

Think like a professional party stylist:
1. Define a clear decoration direction matching the occasion, theme, and colors
2. Build ONE arrangement in the FOCAL ZONE named above — the biggest, most photographed moment of the party lives there. At least HALF the items must be placed in that zone and must read as a single composition, not as separate objects that happen to share a wall.
3. Anything left over goes to a SUPPORTING ZONE. If none are listed, keep everything in the focal zone.
4. Never place an item in an area that is neither the focal zone nor a supporting zone, however tempting the empty surface looks. Scattering one item per wall is what makes a room look messy rather than decorated.
5. Never assign more than 2 items to the same surface or piece of furniture.

For each product provide:
- category: specific decoration type for THIS occasion (e.g. for an Annaprasan: 'annaprasan traditional backdrop')
- searchQuery: SHORT Amazon India search query (3-5 words max) that MUST include the occasion named above. For example, an Annaprasan query should read like 'annaprasan decoration backdrop' or 'annaprasan balloon kit' — NOT 'birthday' anything. CRITICAL: never put a DIFFERENT occasion's name in the query (do not write "birthday" unless the event itself is a birthday). Include the theme/colors where helpful, but keep it generic enough to return results.
- placement: MUST start by naming the zone this belongs to, then the precise spot within it, e.g. 'focal zone — centred on the wall behind the TV console, at eye level'
- reason: how this decoration supports the theme and connects to the others
- colorSuggestion: specific colors/finish matching the theme

- FLOOR & PLACEMENT CONSTRAINT: Never place items in open floor spaces, center-room rugs, or walking paths where guests need to walk. All floor-level items (such as standees, floor balloon clusters, or ground props) must be explicitly assigned to room perimeters, corners, against the base of walls, or directly tucked against heavy furniture (e.g., "anchored tightly against the base of the TV console").

Also write a clear 2-3 sentence designVision describing the styling — color palette, theme, and mood.
```

### 2.2 recommendProducts — outdoor event

Same function, no `stagingPlan`. Note the stylist rules and placement instruction both change.

*Model: `gemini-2.5-flash` · 0 images attached*

```text
You are an expert event decorator. This space will host a Birthday with a "Floral" theme using a Pastel color scheme. All signage and décor must match a Birthday — never a different occasion, and never another country's version of the same-named holiday.

Based on the space analysis and the requested items below, create a decoration vision and recommend specific DECORATION products to style this space for the event.

Space Analysis:
- Type: school ground
- Current Style: modern Indian family home
- Size: large
- Existing Furniture/Surfaces: television, television stand, wooden bed frame
- Lighting: moderate
- Current Colors: #e8ded2, #8a6b4f, #3b3b3b

The user has specifically requested these item types: Balloon arch kit. You MUST include one product for each of these types. You may suggest additional complementary items if needed.

Think like a professional party stylist:
1. Define a clear decoration direction matching the occasion, theme, and colors
2. Pick decorations that work TOGETHER as a cohesive festive set
3. Tie each item to a zone in the space. This is an open or outdoor venue, so spread the items across its natural areas — entrance or gateway, stage or backdrop, seating, perimeter, pathways — rather than concentrating them in one spot.
4. Anchor every item to a real structure visible in the photo (pole, tree, wall, railing, gate, stage, canopy frame, table). Nothing should stand in open ground with no support.

For each product provide:
- category: specific decoration type for THIS occasion (e.g. for an Annaprasan: 'annaprasan traditional backdrop')
- searchQuery: SHORT Amazon India search query (3-5 words max) that MUST include the occasion named above. For example, an Annaprasan query should read like 'annaprasan decoration backdrop' or 'annaprasan balloon kit' — NOT 'birthday' anything. CRITICAL: never put a DIFFERENT occasion's name in the query (do not write "birthday" unless the event itself is a birthday). Include the theme/colors where helpful, but keep it generic enough to return results.
- placement: which zone in the space, e.g. 'on the wall behind the main table'
- reason: how this decoration supports the theme and connects to the others
- colorSuggestion: specific colors/finish matching the theme

- FLOOR & PLACEMENT CONSTRAINT: Never place items in open floor spaces, center-room rugs, or walking paths where guests need to walk. All floor-level items (such as standees, floor balloon clusters, or ground props) must be explicitly assigned to room perimeters, corners, against the base of walls, or directly tucked against heavy furniture (e.g., "anchored tightly against the base of the TV console").

Also write a clear 2-3 sentence designVision describing the styling — color palette, theme, and mood.
```

### 3 curateProducts

*Model: `gemini-2.5-flash` · 2 images attached*

```text
You are an expert interior designer. Look at this room photo and the product images from Amazon.

Design Vision: A pastel floral birthday.

Category 0: balloon arch kit (for focal zone — centred on the wall behind the TV console)
  Design need: Anchors the focal wall.
  Ideal color/finish: pastel pink and mint
  Amazon options:
    Option 0: "Pastel Balloon Arch Garland Kit" — ₹259 (rating: 4.2)

Your job: Pick EXACTLY ONE product from each category that creates the most cohesive, beautiful design together. Consider:
- Color harmony between all selected products AND the existing room
- Style consistency (all products should feel like they belong together)
- Visual appeal and quality based on the product images
- How well each product fits its intended placement in THIS specific room

BUDGET CONSTRAINT: Keep the COMBINED total under ₹3000.

For each category, return the chosen optionIndex and a short reason. Also write a 2-3 sentence designNarrative describing how the products work together to transform the room.
```

### 4 generateDesignImage

*Model: `gemini-3.1-flash-image` · 2 images attached*

```text
Image 1 is a photo of a space that will host an event. This space will host a Birthday with a "Floral" theme using a Pastel color scheme. All signage and décor must match a Birthday — never a different occasion, and never another country's version of the same-named holiday. The following images are decoration products from Amazon to add to the space.

Decorate this EXACT space for the event. This is a STRICT photo editing task — add festive decorations, do not renovate.

SCALE CONSTRAINTS (critical — respect the room's REAL size):
- This space is approximately 11 ft wide × 10 ft deep with a ~9 ft ceiling.
- Use these visible objects as size rulers: television stand (~5.5 ft wide).
- Render EVERY added product at its true real-world size relative to those references. If a product title states a size (e.g. "5x7 ft rug", "6x4 ft backdrop"), treat that size as a hard constraint.
- Never let an added item exceed the wall, floor, or ceiling space that physically exists for it — a rug must fit the visible floor with margin, a backdrop must not span wider than its wall, hanging decor must hang below the ceiling, furniture must not dwarf the existing furniture next to it.
- When unsure, render items slightly SMALLER than plausible rather than larger.

MUST PRESERVE EXACTLY (never change the architecture):
- The exact same walls, wall color, and wall texture. Do NOT add, extend, close off, or invent any walls — if a side of the room is open, half-walls, or has no visible wall in the photo, keep it exactly that open (do NOT enclose the space or "complete" the room).
- The exact same floor and flooring material
- The exact same ceiling, ceiling fan, and light fixtures
- The exact same room dimensions, boundaries, perspective, and camera angle — do NOT crop, zoom, or reframe
- Whether windows and doors exist or not — do NOT add or remove them
- EXISTING DÉCOR ALREADY IN THE PHOTO — flags and flagpoles, religious or devotional items, artwork, framed photos, wall hangings, mirrors, trophies, plants, and any other ornament the occupant has put there. Reproduce each one in place, unchanged, including its exact markings and colours. These belong to the occupant: they are NOT clutter, they are NOT props to be relocated, and an added product must never replace or obscure one.

EXISTING FURNITURE (keep in place):
- ALL existing furniture (sofa, tables, shelves, etc.) — keep them exactly where they are.
- All cables, outlets, and existing items stay as-is.
- Tidy the space as part of the redesign: clear away any small clutter and loose tabletop items (remotes, bottles, cups, food/fruit, papers, chargers, small stray objects) so surfaces look clean and styled. This applies ONLY to disposable everyday objects — never to the main furniture above, and never to anything covered by MUST PRESERVE.
- Nothing may hover in mid-air — if an item's previous support was removed, place it on a real surface or the floor.

ONLY ADD these decorations (use their EXACT appearance from the product images), placed naturally — balloon arches/clusters on the focal wall, backdrop behind the main area, centerpiece on the table, fairy lights along edges:
1. "Pastel Balloon Arch Garland Kit" — shown in image 2. Place this EXACT product (same color, shape, and style as shown in its image) at: focal zone — centred on the wall behind the TV console

FLOOR CLEARANCE & WALKWAY RULE (applies to the products you ADD, never to what is already in the photo): Keep all central room floors, rugs, and walking paths completely clear. Standalone decorative items, cutouts, or props that YOU ADD must be tightly clustered against perimeter walls, corners, or furniture bases. Never scatter added items loose across open floor areas or pathways where people would walk. Décor already standing in the photo — a flagpole, a floor lamp, a plant, a shrine — stays exactly where it is; do NOT relocate or remove it to satisfy this rule.

Each item must look EXACTLY like its reference image — same color, shape, material, and design. Place them naturally with correct scale, perspective, lighting, and shadows.

CRITICAL TEXT RULE (about the products you ADD — it never overrides MUST PRESERVE):
- Do NOT add, render, or reproduce ANY printed words, letters, banners, or signage that name a DIFFERENT occasion than the event described above.
- This rule does NOT apply to markings already present in the room photo. A flag, emblem, artwork or sign that is already there is preserved exactly as-is, whatever it depicts.
- If a product image contains text such as "Happy Birthday" (or any wording that does not match this event), do NOT copy that text — leave the banner/backdrop blank or show only generic decorative patterns.
- Any visible signage must match the event described above, or contain no readable text at all. Never invent gibberish text.
```

### 5 detectHotspots

Second call inside `generateDesignImage` when `detect` is true.

*Model: `gemini-2.5-flash` · 1 image attached*

```text
Detect the 2D bounding box of EACH of these products in this room image. Look at the ACTUAL pixels and find the real object.

Product index 0: "Pastel Balloon Arch Garland Kit" (balloon arch kit) — expected location: focal zone — centred on the wall behind the TV console

For each product return its box_2d as [ymin, xmin, ymax, xmax], each value normalized to 0-1000 (0 = top/left edge, 1000 = bottom/right edge). The box must tightly enclose the ACTUAL product as it appears in the image — e.g. a nightstand box is on the nightstand, not the bed; a wall-art box is on the art; a plant box is on the plant.

Return one detection per product, using the exact productIndex given above.
```

### 6 emptyRoom

Tidy-up pre-pass, run before the design when the user clears anything.

*Model: `gemini-3.1-flash-image` · 1 image attached*

```text
This is a photo of a room. This is a STRICT photo editing task — produce a clean, EMPTY version of this exact room.

Remove these objects: Bean bag, Child's ride-on toy.
KEEP these items exactly as they are, do NOT remove them: Television.

MUST DO:
- Photo-realistically reconstruct the floor, walls, and any surfaces that were hidden behind the removed objects, matching the existing flooring material, wall color, and texture.
- Keep the EXACT same walls, floor, ceiling, windows, doors, built-in fixtures, room layout, dimensions, perspective, camera angle, and lighting.
- Also clear away ALL small clutter and loose tabletop items (remotes, bottles, cups, thermos, food/fruit, books, papers, chargers, small stray objects) so every surface looks clean and tidy — regardless of the list above.
- If any item you KEEP was resting on or supported by an item you remove, do NOT leave it floating — place it naturally on the floor or the nearest suitable surface. Nothing may hover in mid-air.

MUST NOT:
- Do NOT add any new furniture, decorations, or objects.
- Do NOT add, extend, close off, or invent any walls — if a side of the room is open or has no visible wall, keep it exactly that open. Do NOT enclose or "complete" the room.
- Do NOT add or remove windows, doors, or change the architecture.
- Do NOT change the camera angle or crop.

The result must look like a real photograph of the same empty room.
```

### 7 editDesignImage

Admin touch-up of a finished render. Never re-fetches Amazon products.

*Model: `gemini-3.1-flash-image` · 1 image attached*

```text
This is a finished interior/event design render. This is a STRICT photo editing task: apply ONLY the change requested below and leave everything else pixel-identical.

REQUESTED CHANGE:
Put the Indian flag back on the flagpole.

MUST PRESERVE EXACTLY:
- The same framing, camera angle, perspective, and aspect ratio — do NOT crop, zoom, reframe, or letterbox.
- The same walls, floor, ceiling, windows, doors, and lighting.
- Every existing object and decoration that the requested change does not explicitly mention — same position, same size, same colour, same materials. Do not restyle, tidy, upgrade, or "improve" anything you were not asked to touch.
- Overall colour grade and exposure.

MUST NOT:
- Do NOT add any object that was not asked for.
- Do NOT move or resize existing items to make room for the change.
- Do NOT invent readable text. If the change involves signage, render only what was asked for.

The result must look like the same photograph with just the requested edit applied.
```
