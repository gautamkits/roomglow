---
name: noosho-change-safety
description: Pre-change checklist for the noosho (roomglow) codebase. Load BEFORE editing anything in the design pipeline (src/lib/gemini.ts prompts or schemas, analyzeRoom, recommendProducts, curateProducts, generateDesignImage), hotspots, products, emails or crons, paywall/unlock/entitlement, admin routes, or the DB layer. Covers the non-obvious ways changes in this repo break things silently — shared prompt schemas leaking across modes, positional hotspot indices, pre-payment image cost, and what can and cannot be verified locally.
---

# Before you change noosho

This codebase has several places where a reasonable-looking change silently
breaks something else. Each item below cost a real bug. Check the ones that
apply to what you're touching.

## The rule that matters most

**Verify by running it, not by reasoning about it.**

Claiming "this doesn't affect X" without executing X is how the worst bugs here
shipped. A change to the *event* prompt once altered *space* behaviour, and the
reasoning for why it wouldn't was entirely plausible. Running it took two
minutes and showed the model inventing a schema field it was never told about,
which pre-ticked two beds for deletion.

You can run pipeline functions directly against real data:

```bash
# tsx resolves the @/ path aliases; POSTGRES_URL + GOOGLE_AI_API_KEY from .env.local
npx tsx ./script.ts   # place the script in the repo root, delete it after
```
Fetch a real design's `original_image_url` from the `designs` table and run the
actual exported function. Do not reimplement the prompt in your script — you'd
be testing a copy.

## Design pipeline (`src/lib/gemini.ts`)

**One schema, two prompt branches.** `analyzeRoom` has a space branch and an
event branch, but a single shared `roomAnalysisSchema`. `recommendProducts`
builds a single `analysisBlock` used by both `spacePrompt` and `eventPrompt`.
So a field added "for events" gets emitted in space too, because **the model
fills in schema fields it was never instructed about**.

- New mode-specific fields go in **optional, never `required`**.
- Gate mode-specific prompt blocks on `eventContext`.
- Gate mode-specific *behaviour* on the data existing (`stagingPlan` present),
  never on "are any fields populated".
- **The prompt asks; code enforces.** See `enforceVenueBranch` — it strips
  fields the branch shouldn't have rather than trusting the model to omit them.

**Three behaviours must stay distinct**, and space is hands-off unless the user
explicitly asks (see CLAUDE.md):
1. space redesign — no staging, flat 6–8 items, nothing pre-ticked
2. indoor events — focal staging, room-scaled count, movability clearing
3. outdoor/open events — pre-staging logic, flat 6–8, nothing pre-ticked

Verify all three after any prompt/schema change, using real designs of each kind.

## Hotspots and products

**`Hotspot.productIndex` is a positional index into `products`.** Appending a
product is safe. **Removing one silently corrupts every pin after it** — indices
shift, no error, and clicking the backdrop opens the cake stand. Any code that
splices `products` must reindex `hotspots`, and deserves a unit test.

**Hotspots are percentages, so they survive a resolution change but not a
reframe.** Any image edit that preserves hotspots must pin the output aspect
ratio (`aspectOf` + `imageConfig.aspectRatio`). Without pinning, output drifts —
79% measured on a real render — and every pin slides off its product.
`emptyRoom` does *not* pin aspect; `generateDesignImage` and `editDesignImage`
do. Copy from the latter.

`ensureHotspots` **short-circuits on a non-empty array**. Preserved hotspots
will never be silently recomputed; conversely, to force a recompute you must
clear them to `[]` first.

## Cost — read this before adding any image call

`gemini-3.1-flash-image` is ~₹12–15/call and **~95% of the Gemini bill**.
`gemini-2.5-flash` text/vision calls are negligible (~₹1–2/design), so adding a
classification or intent step is cheap; adding an image call is not.

**Image generation happens BEFORE payment.** Every non-converting user costs
real money. Anything that adds an image call to the pre-paywall path multiplies
that exposure. Post-unlock is the safe place for extra renders.

Every billed call must go through `recordImageGen(kind, userId)` or it becomes
untracked spend — and add the new `kind` to the analytics breakdown in
`getAnalytics` (`src/lib/db.ts`), or it won't show in the cost panel.

## Emails and crons

**Transactional vs marketing is a hard split.** Marketing mail (abandoned
checkout, event reminders, activation) must honour `email_optouts`.
Transactional mail (design-ready, sign-in links, share invites) must **never**
be suppressed — opting out must not lock someone out of their account or
withhold something they paid for.

Cron auth guards must **fail closed**. `if (process.env.CRON_SECRET && ...)`
fails *open* when the var is unset — that shipped, leaving mail-sending
endpoints publicly callable.

Any new recurring send needs a **DB** sent-log. `src/lib/rateLimit.ts` is
in-memory and per-instance; it resets on cold start and cannot dedupe a cron.

## Database

**No migration runner.** New tables/columns are self-initialised idempotently
behind a module-level `…Ready` flag — copy `ensureMagicSchema` or
`ensureDesignColumns`. Anything created only by `scripts/migrate.mjs` may not
exist in production; that script has never been run against prod.

All money is stored in **minor units** (paise/cents).

## Privacy and entitlement

Designs are **private by default**. `designVisibility(design, session?)` in
`src/lib/access.ts` is the single predicate, and **every** surface exposing
design pixels or details must use it — the design page, `/api/image/[id]/…`,
`/api/og/[id]`, `/api/share/[id]`. Crawlers are anonymous, so OG routes must
serve real pixels only when gallery-approved.

Affiliate links are rendered through `outboundHref()` → `/api/go`, never raw.
Emails are the deliberate exception.

## Shipping

- **No CI.** Run `npx tsc --noEmit` before pushing; `npm run build` for anything
  touching routes or pages.
- Deploy is **push to `master`** → Vercel auto-deploys. Confirm with
  `npx vercel ls roomglow --yes` and expect ~45–60s builds.
- Next.js 16 here has breaking changes — read `node_modules/next/dist/docs/`
  rather than assuming APIs (see AGENTS.md).

## What you cannot verify locally — say so

`/admin`, `/create` and `/design/[id]` are behind Google sign-in, and you should
not authenticate as the user. So UI changes to those pages **cannot be visually
confirmed**. Typecheck and build prove they compile, nothing more.

State this plainly rather than implying the change was seen working. The honest
line is which part was verified, which wasn't, and what the user should check.
Prompt and pipeline changes *can* be verified — run them (see the top).
