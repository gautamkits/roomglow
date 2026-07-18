import crypto from "crypto";

/**
 * Meta Pixel + Conversions API (server-side) helper.
 *
 * The browser Pixel (see `MetaPixel.tsx`) builds website Custom Audiences and
 * fires PageView; this module sends the same key events server-to-server so
 * conversions survive ad-blockers/iOS and carry hashed identifiers for a high
 * Event Match Quality. Client and server share an `event_id` so Meta
 * deduplicates the pair. Everything here is best-effort and never throws — a
 * tracking failure must not break a save or a payment.
 */

const GRAPH_VERSION = "v21.0";
const PIXEL_ID = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
// Optional: set while validating in Events Manager → Test Events, then remove.
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;

export const metaCapiConfigured = Boolean(PIXEL_ID && ACCESS_TOKEN);

type StandardEvent =
  | "Purchase"
  | "InitiateCheckout"
  | "ViewContent"
  | "Lead"
  | "PageView";

/** Standard events go through `track`; anything else is a custom event. */
type MetaEventName = StandardEvent | "DesignCreated";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Normalize + SHA-256 hash a PII field per Meta's Advanced Matching spec. */
function hashEmail(email?: string | null): string | undefined {
  if (!email) return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256(normalized);
}

function hashExternalId(id?: string | null): string | undefined {
  if (!id) return undefined;
  return sha256(String(id).trim());
}

/** Pull the _fbp / _fbc cookies and client signals off an incoming Request. */
export function metaContextFromRequest(request: Request): {
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  sourceUrl?: string;
} {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const idx = c.indexOf("=");
      return idx === -1
        ? [c.trim(), ""]
        : [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
    })
  );
  const fwd = request.headers.get("x-forwarded-for") || "";
  const clientIp = fwd.split(",")[0]?.trim() || undefined;
  return {
    fbp: cookies["_fbp"] || undefined,
    fbc: cookies["_fbc"] || undefined,
    clientIp,
    userAgent: request.headers.get("user-agent") || undefined,
    sourceUrl: request.headers.get("referer") || undefined,
  };
}

export interface MetaEventInput {
  eventName: MetaEventName;
  /** Shared with the browser Pixel for deduplication. */
  eventId?: string;
  email?: string | null;
  /** Stable user id (hashed) — improves match quality across devices. */
  externalId?: string | null;
  value?: number;
  currency?: string;
  /** Free-form custom_data (e.g. content_ids, content_type, mode). */
  customData?: Record<string, unknown>;
  /** From `metaContextFromRequest(request)`. */
  context?: ReturnType<typeof metaContextFromRequest>;
  actionSource?: "website" | "app" | "system_generated";
}

/**
 * Send one event to the Conversions API. Fire-and-forget: call inside `after()`
 * or `void sendMetaEvent(...)` — it swallows all errors.
 */
export async function sendMetaEvent(input: MetaEventInput): Promise<void> {
  if (!metaCapiConfigured) return;

  const ctx = input.context || {};
  const userData: Record<string, unknown> = {};
  const em = hashEmail(input.email);
  const ext = hashExternalId(input.externalId);
  if (em) userData.em = [em];
  if (ext) userData.external_id = [ext];
  if (ctx.clientIp) userData.client_ip_address = ctx.clientIp;
  if (ctx.userAgent) userData.client_user_agent = ctx.userAgent;
  if (ctx.fbp) userData.fbp = ctx.fbp;
  if (ctx.fbc) userData.fbc = ctx.fbc;

  const customData: Record<string, unknown> = { ...(input.customData || {}) };
  if (input.value != null) customData.value = input.value;
  if (input.currency) customData.currency = input.currency.toUpperCase();

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: input.actionSource || "website",
        ...(input.eventId ? { event_id: input.eventId } : {}),
        ...(ctx.sourceUrl ? { event_source_url: ctx.sourceUrl } : {}),
        user_data: userData,
        custom_data: customData,
      },
    ],
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[meta] CAPI ${input.eventName} failed ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error(`[meta] CAPI ${input.eventName} error:`, err);
  }
}
