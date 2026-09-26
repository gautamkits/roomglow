# Noosho — character & voice guide

The brand mascot. Named after the founder's daughter; she carries the
girl's **spirit** (curious, playful, creative, dreamy), never her likeness.
Keep it that way in every future use — no realistic child features, no photos.

Source of truth for the artwork: `src/components/Mascot.tsx` (SVG, pure, no hooks).

---

## 1. Design

**Concept:** a soft clay bean whose two big eyes *are* the Twin Rings logo.
The logo and the character are the same idea — never lose the ring eyes.

| Part | Spec |
|---|---|
| Body | Bean shape, clay `#BD6A43`, no outline, 200×260 viewBox |
| Left eye | White eye inside a **cream** ring `#FAF6F0` (the logo's cream ring) |
| Right eye | White eye inside a **deep clay** ring `#9A4F2D` (the logo's clay ring, darkened so it shows on the clay body) |
| Pupils | Ink `#181410` with a small white highlight |
| Cheeks | Blush `#F2A7A0` ovals |
| Bow | Pink `#F27A9E`, deeper outline/knot `#C23E6C`, tilted −18°, top-left of head. (Was cream — invisible on clay; changed to pink.) |
| Arms & feet | Stubby, `#A95A36` |
| Ground shadow | Ink at 8% opacity |

**Deliberately avoided** (don't drift back to these):
- Round ears / round buns on top of a round head → Mickey/Minnie silhouette.
- Owl-like tufts or capes → too close to Duolingo.
- A human girl → privacy; the mascot is public and ad-facing.

### Poses (`pose` prop)
`idle` · `peek` (magnifying glass) · `carry` (parcel) · `idea` (pencil + sparkles)
· `celebrate` (arms up, sparkles) · `wave` · `sleep` (eyes closed, zZ)

### Expression props (video frames; defaults leave site rendering unchanged)
- `blink` 0–1 — eyelid closure
- `mouth` — `"smile" | "open" | "wide" | "o"` (lip-sync / surprise)
- `armAngle` — degrees, wave pose; use roughly −6° to 40° (further inward covers her eye)
- `still` — freeze CSS motion (canvas / email)

Site motion is CSS: bob, blink, jump-with-squash, waddle, bow wiggle, twinkle;
all disabled under `prefers-reduced-motion`.

### Where she appears
Wait screen (reacts to each real pipeline phase), every intake step
(`SetupPanelV2`), sign-in wall, paywall, finished design page ("ta-da" only on
first arrival via `?new=1`), home-gallery peekaboo (`NooshoPeekaboo`), 404,
empty profile, and on the before/after slider (`BeforeAfterSlider mascot`).

### Personality in copy
Warm, playful, lower-case, a little Gen-Z but never slang a parent planning an
annaprasan wouldn't understand. Her line must **never repeat the heading under
it** — add a tip, personality, or what happens next.

---

## 2. Voice

**Chosen voice: Gemini TTS `Laomedeia`, Indian English accent.**
The accent target came from a Veo 3.1 clip the founder liked; Laomedeia was the
closest full-length match.

- Model: `gemini-2.5-flash-preview-tts`
- Voice: `Laomedeia` (runner-up: `Leda`, neutral accent, energetic)
- Output: 24 kHz mono PCM → WAV. Resample to 48 kHz for AAC in MP4.
- File: `public/promo/noosho-vo-indian.wav` (19.3 s)

**Direction prompt (use verbatim, then append the script):**
> Read this as Noosho, a tiny, super cute cartoon mascot, in a warm, natural
> Indian English accent — like a sweet, bubbly little Indian girl cartoon
> character. Very energetic and happy, a big smile in the voice, bouncy. Punch
> the greeting 'Hi!', a quick rising list on 'Redoing a room? Planning a
> birthday… or an anniversary?', and a delighted burst on 'Ta-da!'. Clear
> words, upbeat pace. Pronounce 'Noosho' as NOO-shoh:

**Pronunciation:** "Noosho" = **NOO-shoh**. Write the site as
"noosho dot com" in scripts so TTS says it rather than spelling it.

**Current script:**
> Hi! I'm Noosho, your personal interior designer! Redoing a room? Planning a
> birthday… or an anniversary? Just send me one photo! I'll design it… and find
> real pieces you can actually buy! Ta-da! Tap anything to shop it. Let's design
> yours, at noosho dot com!

(India-first. For US ads, swap in a US occasion, e.g. "a birthday, or a baby shower?")

**Other takes on file:** `noosho-vo.wav` (Leda, energetic, neutral accent),
`noosho-vo-calm.wav` (Leda, calm storybook read).

**Line timings:** each VO's per-line segments are in `src/lib/promo/promo.ts`
(`VO_INDIAN_SEGMENTS` etc.). Re-recording changes timing — re-measure with the
silence-detection step (split at the 9 longest pauses for the 10-line script)
and update the constant; the animation re-times itself.

A TTS re-read is never identical to a previous take — changing one word means a
whole new take; re-listen before shipping.

---

## 3. Video

- **Code animation (default):** `src/lib/promo/` — Noosho rasterised from the
  real SVG, lip-synced to VO loudness, blinking, waving. Styles: explainer,
  montage, kinetic, inside-the-app, storybook, product-film. Identical to the
  site, free to re-render.
- **Veo 3.1 (only for character-acting moments):** pass her pose images as
  `referenceImages` (type ASSET) — **not** a first frame (she lost her ring eyes
  within a second that way). `negativePrompt` is rejected in reference mode, so
  put exclusions in the prompt. Veo can speak her line with the Indian accent
  but clips are 8 s, and it must never be trusted with real products or prices.

---

## 4. Rules of thumb
1. Ring eyes are non-negotiable — they are the logo.
2. Represent her spirit, never a real child's likeness.
3. One Noosho per view (the gallery cards don't get their own).
4. She never covers prices, CTAs or the Reels safe zones.
5. Respect reduced motion everywhere.
