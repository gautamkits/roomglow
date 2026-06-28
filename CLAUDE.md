@AGENTS.md

# Noosho (noosho.com)

AI interior & event design from a single photo, with **shoppable** products. A user uploads
one room/venue photo; AI generates a redesign and pins real, buyable Amazon products onto it.
The moat vs. raw image generators (Gemini etc.) is everything around the picture: real product
data (price/links), the paywall, locale-aware commerce, accountability, gallery/community.

## Stack & infra
- **Next.js 16.2.9** App Router + Turbopack, React 19, TypeScript, **Tailwind v4** (`@theme`).
  ⚠️ This Next.js has breaking changes — read `node_modules/next/dist/docs/` before assuming APIs.
- **NextAuth v5** (Google OAuth, JWT) — `auth()` server-side, `useSession()` client.
- **Vercel Postgres** (Neon) via `@vercel/postgres`; **Vercel Blob** (token env is
  `newblob_READ_WRITE_TOKEN`, fall back from `BLOB_READ_WRITE_TOKEN`).
- **Google Gemini**: `gemini-3.1-flash-image` (image gen), `gemini-2.5-flash` (analyze /
  recommend / curate / hotspot detection).
- **Amazon products** via **RapidAPI** `real-time-amazon-data` (`country` = IN/US); affiliate
  tags per locale.
- **Stripe** (US payments). **Instamojo** = legacy/India (NOT approved yet → India is free).
- **ZeptoMail** (transactional email, `Zoho-enczapikey` auth).
- PWA; **Sora** wordmark font; palette **Clay `#bd6a43` / Ink `#181410` / Linen `#faf6f0`**
  (`orange-700` ≈ clay `#a04525`). Logo = Twin Rings + lowercase "noosho" (`src/components/Logo.tsx`),
  assets in `public/icons/`, `src/app/icon.svg`.
- **Deploy:** GitHub `gautamkits/roomglow` → Vercel auto-deploys on push to **master**.
  Verify with `npx vercel ls`. No CI; run `npx tsc --noEmit` before pushing. (Local prod build
  needs a dummy `STRIPE_SECRET_KEY` — Stripe client is lazy but build collects page data.)

## Core design flow
1. **Mode:** `space` (room) or `event`. `SetupPanel` collects event details (type, theme,
   colors, honoree, date, gender) — events are **locale-aware** via `getEvents(locale)`
   (`src/lib/events.ts`): shared + India-only (Annaprasan, Diwali) + US-only (Halloween, Easter,
   4th of July, Thanksgiving, Christmas, etc.).
2. Photo → `/api/analyze-room` (also returns `clutterLevel` + `removableObjects`) → product
   selection → `/api/recommend-products` → `/api/search-products` (Amazon) →
   `/api/curate-products` → `/api/generate-image` (image + hotspots) → `/api/save-design`.
   Hook: `src/hooks/useRoomFlow.ts`. Declutter is **post-unlock only** (see Restyle section) so
   non-payers never trigger a paid empty-room render.
3. Results: `ImageWithHotspots` (clickable product hotspots + "Shop the look" sidebar with
   estimated total — currency inferred from product price strings), `BeforeAfterSlider`,
   download, share-to-gallery, **restyle**. Event designs also show a **"Complete the occasion"**
   product grid (`OccasionProducts`). The before/after **Compare** toggle is available on both
   create-results and `/design/[id]`.

## Locale & pricing (`src/lib/locale.ts`, `useLocale.ts`)
- Locale `IN`/`US` set by `src/middleware.ts` from `x-vercel-ip-country` → cookie
  `noosho-locale`; user can override via `LocaleSwitcher`. `localeFromRequest()` server-side.
- `PAYMENT_ENABLED` = `{ IN: false, US: true }` (India free until Instamojo).
- `AFFILIATE_TAGS`, `AMAZON_DOMAINS`, `formatAmount(amount, currency)` (amount in minor units).
- Pricing is **DB-driven** (`pricing` table per locale: `actual_amount`, `sale_amount`,
  `currency`), admin-editable; defaults IN ₹99 (9900 paise), US $4.99 (499 cents);
  `STRIPE_PRICES` is the fallback.

## Payments & unlock gating
- `/api/stripe/checkout`: admin emails & non-payment markets → `{free:true}`; else create
  Checkout Session. Applies coupon; **100%-off → unlock free + email, no Stripe**. Records a
  `checkout_intents` row for the abandoned funnel.
- `/api/stripe/success`: verify paid → `unlockDesign` → `recordStripeSale` (idempotent on
  `stripe_session_id`) → `ensureHotspots` → send design-ready email.
- `/api/stripe/webhook`: backup unlock + `recordStripeSale` (idempotent).
- `/api/unlock-design`: only unlocks for **free markets / admin / already-unlocked**; paid
  non-admin must pay. `DesignViewer` auto-claim only reveals when API returns `{unlocked:true}`.
- Locked designs: blurred thumb + lock badge in `DesignGrid`; watermarked preview
  (`makeWatermarkedPreview`) served to non-entitled viewers (⚠️ currently throwing a TypeError —
  non-fatal, preview falls back; needs fixing).
- **Coupons** (`coupons` table; percent/fixed, locale, active, expiry, max_uses): `evaluateCoupon`
  in `src/lib/coupons.ts`; admin-managed. `DESIGN20` is pushed in the day-4 abandoned email and
  auto-applied via `?coupon=` on the design link.

## Gallery / home (`src/app/page.tsx`, `force-dynamic`)
- Public grid of `gallery_status='approved'` designs (`getGalleryCards`). Search (`GallerySearch`,
  `q`) with synonym matching (`matchesQuery` in `src/lib/admin.ts`).
- Compact filters: one row of tabs (All/Rooms/Events) + inline sort (Most liked/Newest); category
  chips show only for the active tab as a single horizontally-scrollable row.
- Admins get an inline **delete** on each card (`AdminDeleteButton` → `/api/admin/review` reject).

## Admin (gated by `ADMIN_EMAILS`, e.g. gautamkits@gmail.com — `isAdminEmail`)
- `/admin`: Pending / Published tabs; approve/reject (`/api/admin/review`, revalidates gallery).
- Published tab renders `RevealExport` per design.
- `/admin/analytics`: designs, users, **revenue grouped by currency**, funnel, top room types;
  "Sync Stripe sales" → `/api/admin/backfill-stripe` (recovers sales from Stripe). Plus an
  **"Image-gen calls (billed AI usage)"** panel — every image gen is logged via
  `recordImageGen("design"|"restyle"|"empty", …)` into the `image_gen_events` table; shows
  calls/day, **calls-per-saved-design** (waste signal), and a **tunable ₹/call cost estimate**.
- `/admin/users`: per-user report (designs, unlocked, spend, last active) with search + All/Paying/
  Free filter.
- Pricing & coupon management: `/api/admin/pricing`, `/api/admin/coupons`.

## Reveal video export (admin marketing asset)
`src/lib/revealVideo.ts` + `src/components/RevealExport.tsx`: in-browser **WebCodecs H.264 MP4**,
a branded **1080×1920 commercial** (locked 9:16 — no aspect selector). Scene flow per design:
**logo intro** (three lines: "Redesign any / room. / Then shop it.") → **phone frame** (upload the
before photo → pick a style) → **scan-line before→after transform** → **shoppable pins + product
cards** → **logo + noosho.com outro**. Photos are shown **whole (contain) over a blurred backdrop**
so non-9:16 rooms are never cropped; up to **3 shop cards**. `renderRevealFrame(ctx, t, before,
after, cards)` is exported for frame-level verification. Cross-origin product images go through
`/api/proxy-image` (allow-listed Amazon/Blob hosts) to avoid canvas tainting; pins use each
product's `hotspot` (`ensureHotspots` in `src/lib/hotspots.ts` fills them lazily at unlock).
Chromium-only (WebCodecs).

## Restyle & Clear-the-room (post-unlock)
5 free restyles/design (`MAX_RESTYLES`). On create results (space, unlocked) it re-renders
in-memory; on `/design/[id]` (`/api/restyle-design`) it **saves a new design** (lineage via
`restyled_from`), cap enforced server-side. Style hints:
Modern/Bohemian/Minimalist/Industrial/Scandinavian.
- **Clear the room & redesign** (cluttered space designs, post-unlock): `clearAndRedesign` in
  `useRoomFlow.ts` calls `/api/empty-room` (`emptyRoom`, `gemini-3.1-flash-image`) to empty the
  original, then re-renders the products on the cleaned canvas. **Consumes a restyle** (shares
  the cap). `/api/empty-room` is rate-limited per-user/IP.

## Affiliate links (SEO-safe)
Every affiliate click goes through **`/api/go?u=<encoded>`** — a 302 redirect with
`X-Robots-Tag: noindex, nofollow`, an Amazon-host allowlist (open-redirect guarded). Build hrefs
with `outboundHref()` (`src/lib/outbound.ts`) and render with `rel="nofollow sponsored …"`
(`ProductCard`, `ImageWithHotspots`, `OccasionProducts`). `robots.ts` disallows `/api/go`. The
design-page JSON-LD uses the on-site design URL (no tagged `amazon.*` leaks). **Emails keep
direct affiliate links** (not crawled, better deliverability).

## Occasion products ("Complete the occasion")
Per-event `completionItems` map in `src/lib/events.ts` (gifts, tableware, treats, etc.).
`getCompletionProducts(eventId, locale, subTheme?)` (`src/lib/occasion.ts`, 24h in-memory cache)
→ `/api/occasion-products`. `OccasionProducts.tsx` self-fetches **post-unlock for event designs**
(create results + design page), renders a grid with cloaked links. **Amazon-only — no AI cost**,
loads async so it never delays design generation.

## Cost controls / rate limits
Image generation (`gemini-3.1-flash-image`) ≈ **₹12–15/call** and is ~95% of the Gemini bill
(`gemini-2.5-flash` text/vision calls are negligible). Guards (`src/lib/rateLimit.ts`, in-memory):
per-user caps on `/api/generate-image` and `/api/empty-room` (30/hr user, 100/hr admin, 6/hr
anon-IP); pipeline **"Try again" capped (×3)**; clear-room shares the restyle cap.

## Email & crons (`src/lib/email.ts`, ZeptoMail)
- Design-ready (on unlock/save — only when entitled, never pre-payment for locked US designs).
- Event reminders + abandoned-checkout funnel (day 1 → 3 → 4; final carries `DESIGN20` 20% off).
- **Admin error alerts**: `notifyAdminError({ route, error, … })` emails `ADMIN_EMAILS` with the
  route/message/stack/user when a user hits a failure; wired into the pipeline route catch blocks
  (analyze / recommend / search / curate / generate-image / empty-room / save-design / occasion).
  Best-effort (never throws) and flood-limited (≤3 per route+message signature / 15 min).
- `vercel.json` crons: `event-reminders` (06:00) and `abandoned-checkout` (07:00), guarded by
  `CRON_SECRET`.

## DB conventions
No migration runner. New columns/tables are created idempotently via `CREATE TABLE/INDEX IF NOT
EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, each guarded by a module-level `…Ready` flag
(`ensureBillingSchema`, `ensurePaymentsColumns`, `ensureRestyleColumn`, `ensureDesignColumns`,
checkout_intents). All money stored in **minor units** (paise/cents). Core tables: `users`,
`designs`, `design_likes`, `payments`, `event_dates`, `pricing`, `coupons`, `checkout_intents`,
`image_gen_events` (billed-call log). `saveEventDate` de-dupes (no duplicate "upcoming events").

## Key env vars
Google Gemini key · `NEXTAUTH_URL`/secret + Google OAuth · Postgres · `newblob_READ_WRITE_TOKEN` ·
`RAPIDAPI_KEY` · `AMAZON_PARTNER_TAG` (IN) / `AMAZON_US_PARTNER_TAG` (US, `yuaid01-20`) ·
`STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `ZEPTOMAIL_TOKEN` + `MAIL_FROM_*` · `ADMIN_EMAILS` ·
`CRON_SECRET` · `ABANDON_FINAL_COUPON` (default DESIGN20).

## Known issues / follow-ups
- `makeWatermarkedPreview` throws a TypeError → locked previews aren't generated (non-fatal).
- `middleware.ts` is deprecated in Next 16 → should migrate to `proxy.ts`.
- A bad design URL 500s instead of 404ing (`getDesign` casts to uuid).
- Reveal export motion (full MP4) is best eyeballed from `/admin` after deploy; frame
  compositing is verified via `renderRevealFrame`.
