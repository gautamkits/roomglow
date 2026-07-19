# Noosho — User Flows Reference

_Last updated: 2026-07-03. Reference for payment/limit points and the design-generation pipeline._

---

## 1. Payment & rate-limit flow (when users pay / hit limits)

```
Visitor
  │  (all AI routes require sign-in → anonymous gets 401)
  ▼
Sign in required (Google)
  ▼
Upload photo → AI analyzes
  │   └─ LIMIT: 20/user·hr · 40/IP·hr  (admin 200) → HTTP 429
  ▼
Pick items → AI generates design
  │   └─ LIMIT: 30/user·hr  (admin 100) → HTTP 429
  ▼
Design ready — LOCKED (watermarked preview only)
  ▼
Entitled to a FREE unlock?
  ├─ YES → Free unlock ─────────────────────────────┐
  │        (admin, OR promo user's 1st design)       │
  │                                                  │
  └─ NO → Paywall  (IN ₹99 Razorpay · US $4.99 Stripe)
            ▼
         Pay, or 100%-off coupon?
            ├─ PAID / 100% off ───────────────────────┤
            │                                          ▼
            └─ ABANDON → Stays locked          UNLOCKED ✓
                         (reminder emails       (full image ·
                          day 1 · 3 · 4;         shoppable pins ·
                          d4 carries DESIGN20)   design email)
                                                       ▼
                                        Restyle / Clear-room
                                        (DISABLED now; 5 free/design
                                         per design when re-enabled)
```

**Key facts**
- **Sign-in required** on every AI route (analyze / recommend / search / curate / generate / empty-room / save) — anonymous → 401.
- **Free-unlock paths** (only two, since both IN & US have payments enabled):
  1. **Admin** email (`ADMIN_EMAILS`).
  2. **Promo:** first 500 signups get their **1st design free** (gated by `site_features.first_design_free`; `src/lib/promo.ts`).
  - After the promo cap / for 2nd+ designs → normal paywall.
- **Pricing** (DB-driven `pricing` table): IN ₹99 (9900 paise, Razorpay) · US $4.99 (499 cents, Stripe). 100%-off coupon unlocks free with no gateway.
- **Locked design** = watermarked preview; full-res image + shop links only after unlock.
- **Abandoned checkout** → reminder emails day 1 / 3 / 4 (final carries `DESIGN20`).

**Rate limits** (`src/lib/rateLimit.ts`, in-memory per serverless instance):

| Checkpoint | Per user/hr | Per IP/hr | Admin |
|---|---|---|---|
| Upload / analyze (`uploadRateLimit`) | 20 | 40 (all) + 12 anon | 200 |
| Generate image | 30 | — | 100 |
| Empty-room (clear) | 30 | — | 100 |
| Pipeline "Try again" | ×3 | | |
| Restyles per design | 5 (`MAX_RESTYLES`) | | |

> In-memory limiter = best-effort (resets on cold start, per-instance). For hard cross-instance guarantees, back with Upstash Redis.

---

## 2. Design-generation pipeline (API sequence, start → end)

Hook: `src/hooks/useRoomFlow.ts`. **Every route requires a signed-in session.**

| # | Route | Underlying call | Cost |
|---|---|---|---|
| 1 | `POST /api/analyze-room` | **Gemini 2.5-flash** (vision) → roomType, clutterLevel, suggestions | ~₹0.2 |
| 2 | `POST /api/recommend-products` | **Gemini 2.5-flash** (text) → design vision + Amazon search queries | ~₹0.1 |
| 3 | `POST /api/search-products` | **RapidAPI** `real-time-amazon-data` — 6–8 queries in parallel | plan quota |
| 4 | `POST /api/curate-products` | fetch candidate images + **Gemini 2.5-flash** → picks 1/category + narrative | ~₹0.5 |
| 5 | `POST /api/generate-image` ★ | **Gemini 3.1-flash-image** → render, then **Gemini 2.5-flash** hotspot detection | **~₹12–15** |
| 6 | `POST /api/save-design` | **Vercel Blob** (image upload) + **Postgres** (row + `recordImageGen`) | ~₹0.2 |
| 7 | pay → unlock | **Razorpay / Stripe** → unlock row + `ensureHotspots` + design-ready email | gateway fee |

```
Client ──1──▶ analyze-room     ──▶ Gemini 2.5 (vision)
       ──2──▶ recommend-products──▶ Gemini 2.5 (text)
       ──3──▶ search-products   ──▶ RapidAPI Amazon (×6–8)
       ──4──▶ curate-products   ──▶ fetch imgs + Gemini 2.5
       ──5──▶ generate-image ★  ──▶ Gemini 3.1-flash-image (+ hotspots 2.5)
       ──6──▶ save-design       ──▶ Vercel Blob + Postgres
       ──7──▶ pay/unlock        ──▶ Razorpay/Stripe → email
```

**Notes**
- **★ Step 5 is ~90% of AI cost.** Steps 1–4 & 6 are negligible. Retries & abandoned runs still bill whatever steps ran (watch `image_gen_events` / admin "calls-per-saved-design").
- **Makeover mode** reuses the same skeleton — swaps: 1 → `analyze-person`, 2 → `recommend-outfit`, 5 → `generate-makeover`. Steps 3–4 (Amazon search + curate) are identical. Makeover always computes hotspots at generation.
- **Post-unlock extras** (Amazon-only, no AI cost, async, public): `OccasionProducts` ("Complete the occasion", events) and `MakeoverProducts` ("Complete the look", makeover).
- **Known efficiency gap (pending):** curate (4) downloads all candidate images, then generate (5) re-downloads the selected ones — dedup via a short-TTL byte cache would remove the double fetch with no quality cost.

---

## Unit economics (quick reference)
- **Marginal cost per completed design ≈ ₹14–17** (dominated by step 5).
- At **₹99** unlock → ~85% gross margin on a clean single generation; thinner with retries/restyles.
- At **$4.99** (~₹415) US → same ~₹15 cost, ~4× revenue headroom.
- **Restyle** = +₹12–15 each (5 free/design). **Clear-room** = 2 gens (~₹25–30), counts as 1 restyle. → currently **disabled** in UI.
- True blended cost = admin `/admin/analytics` "calls-per-saved-design" × ₹/call estimate.
