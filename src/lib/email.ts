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

// ─── Brand palette (Clay / Ink / Linen) ───
const INK = "#181410";
const CLAY = "#bd6a43";
const CLAY_CTA = "#a04525";
const LINEN = "#faf6f0";
const TEXT = "#1c1917";
const MUTED = "#78716c";
const FAINT = "#a8a29e";
const BORDER = "#ece7e0";
const LOGO_URL = `${SITE_URL}/icons/icon-192.png`;

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
    ? `<div style="font-size:12px;color:${FAINT};margin-top:3px;line-height:1.4;">${esc(
        p.recommendation.placement
      )}</div>`
    : "";

  // No Amazon match → category + reason, no price/button.
  if (!ap) {
    const reason = p.recommendation.reason
      ? `<div style="font-size:13px;color:${MUTED};margin-top:4px;line-height:1.5;">${esc(
          p.recommendation.reason
        )}</div>`
      : "";
    return `
      <tr><td style="padding:6px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};border:1px solid ${BORDER};border-radius:12px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:15px;font-weight:600;color:${TEXT};">${title}</div>
            ${placement}${reason}
          </td></tr>
        </table>
      </td></tr>`;
  }

  const thumb = ap.imageUrl
    ? `<img src="${esc(ap.imageUrl)}" width="68" height="68" alt="" style="display:block;width:68px;height:68px;object-fit:contain;border-radius:10px;border:1px solid ${BORDER};background:#ffffff;" />`
    : `<div style="width:68px;height:68px;border-radius:10px;background:${LINEN};"></div>`;
  const price = ap.price
    ? `<span style="font-size:16px;font-weight:700;color:${TEXT};">${esc(
        ap.price
      )}</span>`
    : "";
  const stars = ratingStars(ap.rating);
  const ratingHtml = stars
    ? `<span style="font-size:12px;color:${CLAY};margin-left:8px;">${esc(
        stars
      )}</span>`
    : "";

  return `
    <tr><td style="padding:6px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
        <tr>
          <td width="68" valign="top" style="padding:14px 0 14px 14px;">${thumb}</td>
          <td valign="middle" style="padding:14px 12px;">
            <div style="font-size:15px;font-weight:600;color:${TEXT};line-height:1.3;">${title}</div>
            ${placement}
            <div style="margin-top:6px;">${price}${ratingHtml}</div>
          </td>
          <td width="86" valign="middle" align="right" style="padding:14px 14px 14px 0;">
            <a href="${esc(ap.affiliateUrl)}"
               style="display:inline-block;background:${CLAY_CTA};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;">Buy</a>
          </td>
        </tr>
      </table>
    </td></tr>`;
}

export function buildDesignReadyHtml(data: DesignReadyEmailData): string {
  const isEvent = data.mode === "event";
  const title = isEvent
    ? `Your ${data.eventConfig?.eventLabel || "event"} design is ready`
    : "Your room redesign is ready";

  const greeting = data.name ? `Hi ${esc(data.name.split(" ")[0])},` : "Hi there,";
  const designUrl = `${SITE_URL}/design/${data.designId}`;
  const year = new Date().getFullYear();

  const shoppable = data.products.filter((p) => p.amazonProduct).length;
  const countBadge = shoppable
    ? `<span style="display:inline-block;background:${LINEN};color:${CLAY_CTA};font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;border:1px solid ${BORDER};">${shoppable} ${
        shoppable === 1 ? "piece" : "pieces"
      } to shop</span>`
    : "";

  const narrative = data.designNarrative
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
         <tr><td style="border-left:3px solid ${CLAY};padding:2px 0 2px 14px;">
           <p style="font-size:15px;line-height:1.6;color:${MUTED};margin:0;font-style:italic;">${esc(
             data.designNarrative
           )}</p>
         </td></tr>
       </table>`
    : "";

  const rows = data.products.map(productRow).join("");
  const shopSection = rows
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 0;">
         <tr><td>
           <h2 style="font-size:17px;font-weight:700;color:${TEXT};margin:0 0 2px;letter-spacing:-0.01em;">Shop the look</h2>
           <p style="font-size:13px;color:${MUTED};margin:0 0 12px;">Hand-picked to match your design. ${countBadge}</p>
         </td></tr>
       </table>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
    : "";

  const eyebrow = isEvent ? "YOUR EVENT DESIGN IS READY" : "YOUR REDESIGN IS READY";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /></head>
<body style="margin:0;padding:0;background:${LINEN};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">Your AI design is ready — see it and shop the exact pieces to make it real.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">

        <tr><td style="background:${INK};padding:18px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle"><img src="${esc(
              LOGO_URL
            )}" width="34" height="34" alt="Noosho" style="display:block;width:34px;height:34px;border-radius:9px;" /></td>
            <td valign="middle" style="padding-left:10px;"><span style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:${LINEN};">noosho</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:26px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.10em;color:${CLAY_CTA};margin:0 0 8px;">${eyebrow}</div>
          <h1 style="font-size:25px;font-weight:700;color:${TEXT};margin:0 0 8px;letter-spacing:-0.02em;line-height:1.25;">${esc(
            title
          )}</h1>
          <p style="font-size:15px;color:${MUTED};margin:0 0 18px;line-height:1.6;">${greeting} we turned your photo into a finished look — and lined up the exact pieces to make it real.</p>
        </td></tr>

        <tr><td style="padding:0 28px;">
          <img src="${esc(
            data.generatedImageUrl
          )}" alt="Your design" width="544" style="display:block;width:100%;height:auto;border-radius:14px;border:1px solid ${BORDER};" />
        </td></tr>

        <tr><td style="padding:22px 28px 0;">
          ${narrative}
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:11px;background:${CLAY_CTA};">
            <a href="${esc(
              designUrl
            )}" style="display:inline-block;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:11px;">View &amp; shop your design →</a>
          </td></tr></table>
          ${shopSection}
        </td></tr>

        <tr><td style="padding:30px 28px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};border-radius:14px;">
            <tr><td align="center" style="padding:22px 20px;">
              <div style="font-size:16px;font-weight:700;color:${TEXT};margin:0 0 4px;">Love it? Try another room.</div>
              <div style="font-size:13px;color:${MUTED};margin:0 0 14px;">A new photo is all it takes — free.</div>
              <a href="${esc(
                SITE_URL
              )}/create" style="display:inline-block;background:#ffffff;color:${CLAY_CTA};text-decoration:none;font-size:14px;font-weight:600;padding:10px 22px;border-radius:9px;border:1px solid ${BORDER};">Design another →</a>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:22px 28px 28px;">
          <p style="font-size:13px;color:${MUTED};margin:0 0 12px;">
            <a href="${esc(
              SITE_URL
            )}" style="color:${CLAY_CTA};text-decoration:none;font-weight:600;">noosho.com</a>
            &nbsp;·&nbsp;
            <a href="${esc(
              SITE_URL
            )}/explore" style="color:${CLAY_CTA};text-decoration:none;font-weight:600;">Explore the gallery</a>
          </p>
          <p style="font-size:11px;line-height:1.6;color:${FAINT};margin:0;border-top:1px solid ${BORDER};padding-top:14px;">
            © ${year} Noosho. ${AFFILIATE_DISCLOSURE}<br />
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
