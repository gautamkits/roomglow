import type { AppMode, EventConfig, ProductResult } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

// ─── Config ───
const ZEPTOMAIL_API_URL =
  process.env.ZEPTOMAIL_API_URL || "https://api.zeptomail.in/v1.1/email";
const ZEPTOMAIL_TOKEN = process.env.ZEPTOMAIL_TOKEN;
const FROM_ADDRESS = process.env.MAIL_FROM_ADDRESS || "designs@noosho.com";
const FROM_NAME = process.env.MAIL_FROM_NAME || "Noosho";

const AFFILIATE_DISCLOSURE =
  "AI-generated designs are suggestions for inspiration. Product prices and " +
  "availability are set by Amazon. As an Amazon Associate we earn from " +
  "qualifying purchases.";

export interface DesignReadyEmailData {
  to: string;
  name?: string;
  designId: string;
  mode: AppMode;
  eventConfig?: EventConfig | null;
  designNarrative?: string;
  generatedImageUrl: string;
  products: ProductResult[];
}

// Minimal HTML escaping for values interpolated into the template.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ratingStars(rating: number): string {
  if (!rating || rating <= 0) return "";
  const rounded = Math.round(rating * 10) / 10;
  return `★ ${rounded.toFixed(1)}`;
}

function productRow(p: ProductResult): string {
  const ap = p.amazonProduct;
  const title = esc(ap?.title || p.recommendation.category || "Suggested item");
  const placement = p.recommendation.placement
    ? `<div style="font-size:12px;color:#a1a1aa;margin-top:2px;">${esc(
        p.recommendation.placement
      )}</div>`
    : "";

  // No Amazon match → category + reason, no price/button.
  if (!ap) {
    const reason = p.recommendation.reason
      ? `<div style="font-size:13px;color:#71717a;margin-top:4px;">${esc(
          p.recommendation.reason
        )}</div>`
      : "";
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
          <div style="font-size:15px;font-weight:600;color:#18181b;">${title}</div>
          ${placement}${reason}
        </td>
      </tr>`;
  }

  const thumb = ap.imageUrl
    ? `<img src="${esc(ap.imageUrl)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:contain;border-radius:8px;border:1px solid #f0f0f0;background:#fafafa;" />`
    : "";
  const price = ap.price
    ? `<span style="font-size:15px;font-weight:700;color:#18181b;">${esc(
        ap.price
      )}</span>`
    : "";
  const stars = ratingStars(ap.rating);
  const ratingHtml = stars
    ? `<span style="font-size:12px;color:#f59e0b;margin-left:8px;">${esc(
        stars
      )}</span>`
    : "";

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #f0f0f0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="64" valign="top" style="padding-right:14px;">${thumb}</td>
            <td valign="top">
              <div style="font-size:15px;font-weight:600;color:#18181b;line-height:1.3;">${title}</div>
              ${placement}
              <div style="margin-top:6px;">${price}${ratingHtml}</div>
            </td>
            <td width="90" valign="middle" align="right">
              <a href="${esc(ap.affiliateUrl)}"
                 style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;">Buy</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

export function buildDesignReadyHtml(data: DesignReadyEmailData): string {
  const isEvent = data.mode === "event";
  const title = isEvent
    ? `Your ${data.eventConfig?.eventLabel || "event"} design is ready`
    : "Your room redesign is ready";

  const greeting = data.name ? `Hi ${esc(data.name.split(" ")[0])},` : "Hi,";
  const designUrl = `${SITE_URL}/design/${data.designId}`;

  const narrative = data.designNarrative
    ? `<p style="font-size:15px;line-height:1.6;color:#52525b;margin:0 0 20px;">${esc(
        data.designNarrative
      )}</p>`
    : "";

  const rows = data.products.map(productRow).join("");
  const shopSection = rows
    ? `
      <h2 style="font-size:16px;font-weight:700;color:#18181b;margin:28px 0 4px;">Shop the look</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaf9;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
        <tr><td style="padding:24px 28px 0;">
          <span style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#c2410c;">Noosho</span>
        </td></tr>
        <tr><td style="padding:16px 28px 0;">
          <h1 style="font-size:24px;font-weight:700;color:#18181b;margin:0 0 6px;letter-spacing:-0.02em;">${esc(
            title
          )}</h1>
          <p style="font-size:15px;color:#52525b;margin:0 0 18px;">${greeting} here's your design — and everything you need to make it real.</p>
        </td></tr>
        <tr><td style="padding:0 28px;">
          <img src="${esc(
            data.generatedImageUrl
          )}" alt="Your design" width="544" style="display:block;width:100%;height:auto;border-radius:12px;border:1px solid #f0f0f0;" />
        </td></tr>
        <tr><td style="padding:20px 28px 0;">
          ${narrative}
          <a href="${esc(
            designUrl
          )}" style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:10px;">View your design</a>
          ${shopSection}
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="font-size:11px;line-height:1.6;color:#a1a1aa;margin:0;border-top:1px solid #f0f0f0;padding-top:16px;">
            © ${new Date().getFullYear()} Noosho. ${AFFILIATE_DISCLOSURE}<br />
            You're receiving this because you created a design on Noosho.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send the "your design is ready" email via Zoho ZeptoMail.
 * Never throws — returns { ok } and logs failures so callers (save-design)
 * are never broken by a mail problem.
 */
export async function sendDesignReadyEmail(
  data: DesignReadyEmailData
): Promise<{ ok: boolean }> {
  if (!ZEPTOMAIL_TOKEN) {
    console.error("[email] ZEPTOMAIL_TOKEN not set — skipping design-ready email");
    return { ok: false };
  }
  if (!data.to) return { ok: false };

  const isEvent = data.mode === "event";
  const subject = isEvent
    ? `Your ${data.eventConfig?.eventLabel || "event"} design is ready 🎉`
    : "Your room redesign is ready ✨";

  try {
    // Accept the token with or without the "Zoho-enczapikey " prefix —
    // ZeptoMail's copy button is inconsistent about including it.
    const authHeader = ZEPTOMAIL_TOKEN.startsWith("Zoho-enczapikey")
      ? ZEPTOMAIL_TOKEN
      : `Zoho-enczapikey ${ZEPTOMAIL_TOKEN}`;

    const res = await fetch(ZEPTOMAIL_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        from: { address: FROM_ADDRESS, name: FROM_NAME },
        to: [
          {
            email_address: {
              address: data.to,
              name: data.name || data.to,
            },
          },
        ],
        subject,
        htmlbody: buildDesignReadyHtml(data),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[email] ZeptoMail send failed: ${res.status} ${body.slice(0, 300)}`
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] ZeptoMail send threw:", err);
    return { ok: false };
  }
}
