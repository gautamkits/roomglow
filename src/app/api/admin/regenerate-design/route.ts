import { NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDesign, getUserById, saveDesign, setRestyledFrom, recordImageGen } from "@/lib/db";
import { regenerateDesign } from "@/lib/regenerate";
import { makeBlurDataUrl, makeWatermarkedPreview } from "@/lib/images";
import { notifyAdminError, sendAdminDesignEmail } from "@/lib/email";
import { getPricing } from "@/lib/db";
import { formatAmount, type Locale } from "@/lib/locale";
import { onDesignUnlocked } from "@/lib/unlock";
import { rateLimit } from "@/lib/rateLimit";
import type { EventConfig, RoomAnalysis } from "@/lib/types";

// Blob + sharp + the model pipeline — not edge.
export const runtime = "nodejs";
// The pipeline is four sequential model/API round trips.
export const maxDuration = 300;

const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN || process.env.newblob_READ_WRITE_TOKEN;

function asJson<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

/**
 * Which Amazon marketplace this design was built against.
 *
 * `designs` has no locale column and the request's locale is the ADMIN's, not
 * the user's — so infer it from the design's own products. The affiliate URL
 * carries the domain outright; the price symbol is the fallback. Getting this
 * wrong would source amazon.in products for a US user (and quote the price in
 * the wrong currency), so it's worth deriving rather than defaulting.
 */
function localeFromDesign(products: unknown): Locale {
  const list = asJson<{ amazonProduct?: { affiliateUrl?: string; price?: string } | null }[]>(
    products
  );
  if (!Array.isArray(list)) return "IN";
  for (const p of list) {
    const url = p?.amazonProduct?.affiliateUrl || "";
    if (url.includes("amazon.in")) return "IN";
    if (url.includes("amazon.com")) return "US";
  }
  for (const p of list) {
    const price = p?.amazonProduct?.price || "";
    if (price.includes("₹")) return "IN";
    if (price.includes("$")) return "US";
  }
  return "IN";
}

/**
 * Admin: regenerate a design for the user who owns it, then email it to them —
 * either as a free gift (unlocked on arrival) or locked at the normal price.
 *
 * Note this deliberately does NOT reuse /api/restyle-design: that route is
 * space-only, requires the design to already be unlocked, and saves the result
 * under the CALLER's user id — which for an admin would silently reparent the
 * new design away from the user it was made for.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      designId?: string;
      free?: boolean;
      note?: string;
      overrides?: Partial<
        Pick<EventConfig, "subTheme" | "colorScheme" | "honoree" | "age">
      >;
    };
    const designId = String(body.designId || "");
    if (!designId) {
      return NextResponse.json({ error: "Missing designId" }, { status: 400 });
    }

    // Each run is a billed image generation plus a fan-out of Amazon searches.
    if (!rateLimit(`admin-regen:${session!.user!.id}`, 20, 60 * 60 * 1000).ok) {
      return NextResponse.json(
        { error: "Too many regenerations this hour. Try again later." },
        { status: 429 }
      );
    }

    const design = await getDesign(designId);
    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }
    const ownerId = (design.user_id as string | null) ?? null;
    if (!ownerId) {
      return NextResponse.json(
        { error: "This design has no owner, so there's nobody to send it to." },
        { status: 400 }
      );
    }
    const owner = await getUserById(ownerId);
    if (!owner?.email) {
      return NextResponse.json(
        { error: "That user has no email address on file." },
        { status: 400 }
      );
    }

    const roomAnalysis = asJson<RoomAnalysis>(design.room_analysis);
    if (!roomAnalysis) {
      return NextResponse.json(
        { error: "This design has no stored room analysis, so it can't be regenerated." },
        { status: 400 }
      );
    }

    // Merge the admin's tweaks over the design's stored event config. Only the
    // four fields the admin can actually edit are taken from the request.
    const stored = asJson<EventConfig>(design.event_config);
    const eventConfig: EventConfig | null = stored
      ? {
          ...stored,
          ...(body.overrides?.subTheme ? { subTheme: body.overrides.subTheme } : {}),
          ...(body.overrides?.colorScheme
            ? { colorScheme: body.overrides.colorScheme }
            : {}),
          ...(body.overrides?.honoree !== undefined
            ? { honoree: body.overrides.honoree || undefined }
            : {}),
          ...(body.overrides?.age !== undefined
            ? { age: body.overrides.age || undefined }
            : {}),
        }
      : null;

    const free = !!body.free;
    const locale = localeFromDesign(design.products);

    const result = await regenerateDesign({
      originalImageUrl: String(design.original_image_url),
      roomAnalysis,
      mode: String(design.mode || "space"),
      eventConfig,
      selectedItems: asJson<string[]>(design.selected_items) ?? [],
      locale,
      // Hotspots are only visible once unlocked; a locked send backfills them
      // through the normal unlock path instead of paying for them now.
      detect: free,
    });

    const ts = Date.now();
    const generatedBuf = Buffer.from(result.generatedImage, "base64");
    const generatedBlob = await put(`designs/${ts}-admin.png`, generatedBuf, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
      token: blobToken,
    });
    const generatedBlur = await makeBlurDataUrl(generatedBuf).catch(() => null);

    // A locked design serves this watermarked preview to non-entitled viewers;
    // without it /api/image/[id]/after has nothing to return but a 403.
    let previewImageUrl: string | null = null;
    if (!free) {
      try {
        const previewBuf = await makeWatermarkedPreview(generatedBuf);
        const previewBlob = await put(`designs/${ts}-admin-preview.jpg`, previewBuf, {
          access: "public",
          contentType: "image/jpeg",
          addRandomSuffix: true,
          token: blobToken,
        });
        previewImageUrl = previewBlob.url;
      } catch (e) {
        console.error("[admin-regen] preview generation failed:", e);
      }
    }

    const newId = await saveDesign({
      mode: String(design.mode || "space"),
      eventConfig,
      roomAnalysis,
      products: result.products,
      hotspots: result.hotspots,
      designNarrative: result.narrative,
      // Same photo — reuse the stored original rather than re-uploading it.
      originalImageUrl: String(design.original_image_url),
      generatedImageUrl: generatedBlob.url,
      previewImageUrl,
      originalBlur: (design.original_blur as string | null) ?? null,
      generatedBlur,
      // The USER owns this, not the admin who triggered it.
      userId: ownerId,
      isUnlocked: free,
      selectedItems: asJson<string[]>(design.selected_items) ?? null,
    });

    await setRestyledFrom(newId, (design.restyled_from as string) || designId);
    // Logged against the admin who spent it, matching /api/restyle-design.
    await recordImageGen("design", session!.user!.id);
    if (free && newId) onDesignUnlocked(newId);

    // Price label for the locked variant, from the same DB-driven pricing the
    // paywall uses so the email can never quote a stale number.
    let priceLabel: string | undefined;
    if (!free) {
      try {
        const pricing = await getPricing(locale);
        if (pricing) {
          priceLabel = formatAmount(pricing.sale_amount, pricing.currency);
        }
      } catch {
        /* label is cosmetic — the paywall is the source of truth */
      }
    }

    const eventLabel = eventConfig?.eventLabel;
    after(() =>
      sendAdminDesignEmail({
        to: String(owner.email),
        name: (owner.name as string) || undefined,
        designId: newId,
        generatedImageUrl: generatedBlob.url,
        eventLabel,
        free,
        priceLabel,
        note: body.note?.trim() || undefined,
      }).catch(() => {})
    );

    return NextResponse.json({
      designId: newId,
      sentTo: owner.email,
      free,
      productCount: result.products.length,
    });
  } catch (error) {
    console.error("Admin regenerate failed:", error);
    await notifyAdminError({ route: "admin/regenerate-design", error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate" },
      { status: 500 }
    );
  }
}
