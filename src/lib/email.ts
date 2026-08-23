import { createHmac, timingSafeEqual } from "crypto";
import type { AppMode, EventConfig, ProductResult } from "@/lib/types";
import { SITE_URL } from "@/lib/site";
import { formatAmount } from "@/lib/locale";
import { rateLimit } from "@/lib/rateLimit";
import { isEmailOptedOut } from "@/lib/db";

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

// ─── Send primitive ───
// Every email in the app goes through this. It exists so there is exactly one
// place that talks to ZeptoMail — previously the auth-header normalisation and
// fetch block were copy-pasted into all nine senders, which is why there was
// nowhere to hook a suppression check or an unsubscribe header.
interface MailRecipient {
  address: string;
  name?: string | null;
}

export async function sendMail(opts: {
  to: MailRecipient | MailRecipient[];
  subject: string;
  html: string;
  replyTo?: MailRecipient;
  /** Marketing mail passes the recipient's unsubscribe URL; transactional omits it. */
  unsubscribeUrl?: string;
  label: string;
}): Promise<{ ok: boolean }> {
  if (!ZEPTOMAIL_TOKEN) {
    console.error(`[email] ZEPTOMAIL_TOKEN not set — skipping ${opts.label}`);
    return { ok: false };
  }
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(
    (r) => r.address
  );
  if (!recipients.length) return { ok: false };

  try {
    // Accept the token with or without the "Zoho-enczapikey " prefix —
    // ZeptoMail's copy button is inconsistent about including it.
    const authHeader = ZEPTOMAIL_TOKEN.startsWith("Zoho-enczapikey")
      ? ZEPTOMAIL_TOKEN
      : `Zoho-enczapikey ${ZEPTOMAIL_TOKEN}`;

    const payload: Record<string, unknown> = {
      from: { address: FROM_ADDRESS, name: FROM_NAME },
      to: recipients.map((r) => ({
        email_address: { address: r.address, name: r.name || r.address },
      })),
      subject: opts.subject,
      htmlbody: opts.html,
    };
    if (opts.replyTo) {
      payload.reply_to = [
        { address: opts.replyTo.address, name: opts.replyTo.name || opts.replyTo.address },
      ];
    }
    // RFC 8058 one-click unsubscribe. Gmail and Yahoo require this on bulk mail,
    // and it is what stops a "this is spam" click from poisoning the sending
    // domain that also carries our transactional mail.
    // ZeptoMail's key is `mime_headers`, NOT `headers`. Sending `headers`
    // returns 400 TM_3301 / GE_121 "An extra key found in the input value",
    // which silently killed EVERY marketing send — transactional mail omits
    // this block, so the failure only ever hit opt-out-able campaigns.
    if (opts.unsubscribeUrl) {
      payload.mime_headers = {
        "List-Unsubscribe": `<${opts.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }

    const res = await fetch(ZEPTOMAIL_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[email] ZeptoMail ${opts.label} failed: ${res.status} ${body.slice(0, 300)}`
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[email] ZeptoMail ${opts.label} threw:`, err);
    return { ok: false };
  }
}

// ─── Unsubscribe links ───
// Stateless and HMAC-signed rather than a stored token: an unsubscribe link has
// to keep working months later, from an inbox, with no session. Falls back to
// NEXTAUTH_SECRET so this works without adding a new required env var.
const UNSUB_SECRET =
  process.env.UNSUB_SECRET || process.env.NEXTAUTH_SECRET || "";

export function unsubscribeSignature(email: string): string {
  return createHmac("sha256", UNSUB_SECRET)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

export function verifyUnsubscribeSignature(email: string, sig: string): boolean {
  if (!UNSUB_SECRET || !email || !sig) return false;
  const expected = Buffer.from(unsubscribeSignature(email));
  const given = Buffer.from(sig);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(email.trim().toLowerCase());
  return `${SITE_URL}/api/unsubscribe?e=${e}&s=${unsubscribeSignature(email)}`;
}

/**
 * Footer block shared by every template. Marketing mail passes `unsubUrl` and
 * gets a working opt-out; transactional mail (sign-in links, share invites,
 * the design they paid for) omits it and is never suppressed.
 */
function footerBlock(opts: {
  reason: string;
  unsubUrl?: string;
  disclosure?: boolean;
  padding?: string;
}): string {
  const year = new Date().getFullYear();
  return `
        <tr><td style="padding:${opts.padding || "22px 28px 28px"};">
          <p style="font-size:11px;line-height:1.6;color:${FAINT};margin:0;border-top:1px solid ${BORDER};padding-top:14px;">
            © ${year} Noosho.${opts.disclosure ? ` ${AFFILIATE_DISCLOSURE}` : ""}<br />
            ${opts.reason}${
              opts.unsubUrl
                ? `<br /><a href="${esc(opts.unsubUrl)}" style="color:${FAINT};text-decoration:underline;">Unsubscribe from these emails</a>`
                : ""
            }
          </p>
        </td></tr>`;
}

/** Marketing sends funnel through this so opt-out is enforced in one place. */
async function suppressed(email: string, label: string): Promise<boolean> {
  try {
    if (await isEmailOptedOut(email)) {
      console.log(`[email] ${label} suppressed — ${email} opted out`);
      return true;
    }
  } catch (err) {
    // Never let a suppression-lookup failure block a send.
    console.error(`[email] opt-out check failed for ${label}:`, err);
  }
  return false;
}

// Minimal HTML escaping for values interpolated into the template.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Amazon titles run 150+ chars, which wrap into a tall, ugly column on mobile
// (email clients don't support line-clamp). Trim to a readable length.
function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function ratingStars(rating: number): string {
  if (!rating || rating <= 0) return "";
  const rounded = Math.round(rating * 10) / 10;
  return `★ ${rounded.toFixed(1)}`;
}

function productRow(p: ProductResult): string {
  const ap = p.amazonProduct;
  const title = esc(
    truncate(ap?.title || p.recommendation.category || "Suggested item", 60)
  );
  const placement = p.recommendation.placement
    ? `<div style="font-size:12px;color:${FAINT};margin-top:3px;line-height:1.4;">${esc(
        truncate(p.recommendation.placement, 70)
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

  // Two columns (thumb | content) so the title gets the full width and stays a
  // couple of lines on mobile; price and the Buy button share a row underneath.
  return `
    <tr><td style="padding:6px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
        <tr>
          <td width="68" valign="top" style="padding:14px 0 14px 14px;">${thumb}</td>
          <td valign="top" style="padding:14px 14px 14px 12px;">
            <div style="font-size:15px;font-weight:600;color:${TEXT};line-height:1.35;">${title}</div>
            ${placement}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
              <tr>
                <td valign="middle">${price}${ratingHtml}</td>
                <td valign="middle" align="right">
                  <a href="${esc(ap.affiliateUrl)}"
                     style="display:inline-block;background:${CLAY_CTA};color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;">Buy</a>
                </td>
              </tr>
            </table>
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

export interface EventReminderEmailData {
  to: string;
  name?: string;
  eventLabel: string;
  eventDate: string; // ISO date string e.g. "2026-07-10"
  honoree?: string | null;
  daysUntil: number;
}

export function buildEventReminderHtml(data: EventReminderEmailData): string {
  const firstName = data.name ? esc(data.name.split(" ")[0]) : "there";
  const dateFormatted = new Date(data.eventDate).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const honoreeText = data.honoree ? ` for ${esc(data.honoree)}` : "";
  const urgency =
    data.daysUntil === 0
      ? "It's today!"
      : data.daysUntil === 1
      ? "It's tomorrow!"
      : `It's in ${data.daysUntil} days.`;
  const createUrl = `${SITE_URL}/create`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /></head>
<body style="margin:0;padding:0;background:${LINEN};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">Your ${esc(data.eventLabel)}${honoreeText} is coming up — design the space before it's too late.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">

        <tr><td style="background:${INK};padding:18px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle"><img src="${esc(LOGO_URL)}" width="34" height="34" alt="Noosho" style="display:block;width:34px;height:34px;border-radius:9px;" /></td>
            <td valign="middle" style="padding-left:10px;"><span style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:${LINEN};">noosho</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:28px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.10em;color:${CLAY_CTA};margin:0 0 8px;">UPCOMING EVENT REMINDER</div>
          <h1 style="font-size:25px;font-weight:700;color:${TEXT};margin:0 0 8px;letter-spacing:-0.02em;line-height:1.25;">
            Your ${esc(data.eventLabel)}${honoreeText} is almost here
          </h1>
          <p style="font-size:15px;color:${MUTED};margin:0 0 20px;line-height:1.6;">Hi ${firstName}, ${urgency} ${dateFormatted}.</p>
        </td></tr>

        <tr><td style="padding:0 28px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};border-radius:14px;border:1px solid ${BORDER};">
            <tr><td style="padding:22px 24px;">
              <div style="font-size:32px;margin-bottom:10px;">🎉</div>
              <div style="font-size:17px;font-weight:700;color:${TEXT};margin:0 0 6px;">Ready to set the scene?</div>
              <div style="font-size:14px;color:${MUTED};line-height:1.6;margin:0 0 18px;">
                Upload a photo of the venue and Noosho will design the decorations — then line up the exact products to shop.
              </div>
              <a href="${esc(createUrl)}" style="display:inline-block;background:${CLAY_CTA};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:11px;">Design the space →</a>
            </td></tr>
          </table>
        </td></tr>

${footerBlock({
          reason:
            "You&rsquo;re receiving this because you saved an upcoming event on Noosho.",
          unsubUrl: unsubscribeUrl(data.to),
          padding: "8px 28px 28px",
        })}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Admin error alerts ───
// Notifies admins when a user hits a failure, with enough detail to troubleshoot.
// Best-effort (never throws) and flood-protected so a recurring error can't spam
// the inbox.

export interface AdminErrorContext {
  /** Which route/step failed, e.g. "generate-image". */
  route: string;
  error: unknown;
  userId?: string | null;
  userEmail?: string | null;
  locale?: string | null;
  /** Any extra context worth troubleshooting (designId, labels, etc.). */
  extra?: Record<string, unknown>;
}

function adminRecipients(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Alert admins when someone rates a design poorly.
 *
 * The point is to see WHAT they disliked, so the render is embedded and the
 * design links straight through. Deliberately an admin alert rather than user
 * mail: it never touches email_optouts, because it is not addressed to the
 * person who complained.
 *
 * Best-effort and flood-limited, like notifyAdminError — a burst of bad ratings
 * is exactly when you least want the mailer to become the bottleneck.
 */
export async function notifyAdminFeedback(data: {
  designId: string;
  rating: string;
  reason?: string | null;
  userEmail?: string | null;
  mode?: string | null;
  eventLabel?: string | null;
  generatedImageUrl?: string | null;
  locale?: string | null;
}): Promise<{ ok: boolean }> {
  const recipients = adminRecipients();
  if (recipients.length === 0) return { ok: false };
  // At most 5 per rating bucket per 15 min, so one upset session can't flood.
  if (!rateLimit(`feedback:${data.rating}`, 5, 15 * 60 * 1000).ok) return { ok: false };

  const link = `${SITE_URL}/design/${data.designId}`;
  const face = data.rating === "sad" ? "😞" : data.rating === "ok" ? "😐" : "😍";
  const rows: [string, string][] = [
    ["Rating", `${face}  ${data.rating}`],
    ["Why", data.reason?.trim() || "— (not given)"],
    ["User", data.userEmail || "anonymous"],
    ["Mode", data.mode || "—"],
    ["Occasion", data.eventLabel || "—"],
    ["Locale", data.locale || "—"],
    ["Design", link],
  ];
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;color:${TEXT};vertical-align:top;white-space:nowrap;">${esc(
          k
        )}</td><td style="padding:6px 12px;color:${MUTED};font-size:13px;word-break:break-word;">${esc(
          v
        )}</td></tr>`
    )
    .join("");
  const shot = data.generatedImageUrl
    ? `<img src="${esc(data.generatedImageUrl)}" alt="" style="width:100%;max-width:552px;border-radius:10px;border:1px solid ${BORDER};display:block;margin:16px 0 0;" />`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:${LINEN};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="background:${INK};padding:16px 24px;color:${LINEN};font-size:18px;font-weight:700;">${face} Noosho — design feedback</td></tr>
    <tr><td style="padding:20px 24px;">
      <p style="font-size:14px;color:${MUTED};margin:0 0 16px;">Someone rated a design. Here is what they saw:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;border-collapse:separate;">${rowsHtml}</table>
      ${shot}
      <p style="margin:18px 0 0;"><a href="${esc(link)}" style="display:inline-block;background:${CLAY_CTA};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">Open the design</a></p>
    </td></tr>
  </table>
</body></html>`;

  return sendMail({
    to: recipients.map((address) => ({ address, name: "Admin" })),
    subject: `${face} Noosho feedback — ${data.rating}${data.eventLabel ? ` · ${data.eventLabel}` : ""}`,
    html,
    label: "admin-feedback",
  });
}

export async function notifyAdminError(ctx: AdminErrorContext): Promise<{ ok: boolean }> {
  const recipients = adminRecipients();
  if (recipients.length === 0) return { ok: false };

  const err = ctx.error;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const stack = err instanceof Error && err.stack ? err.stack : "";

  // Flood protection: at most 3 alerts per route+message signature per 15 min.
  const sig = `adminerr:${ctx.route}:${message.slice(0, 80)}`;
  if (!rateLimit(sig, 3, 15 * 60 * 1000).ok) return { ok: false };

  const when = new Date().toISOString();
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
  const rows: [string, string][] = [
    ["Route", ctx.route],
    ["Error", message],
    ["User", ctx.userEmail || ctx.userId || "anonymous"],
    ["Locale", ctx.locale || "—"],
    ["Environment", env],
    ["Time (UTC)", when],
  ];
  if (ctx.extra) {
    for (const [k, v] of Object.entries(ctx.extra)) {
      rows.push([k, typeof v === "string" ? v : JSON.stringify(v)]);
    }
  }

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;color:${TEXT};vertical-align:top;white-space:nowrap;">${esc(
          k
        )}</td><td style="padding:6px 12px;color:${MUTED};font-family:monospace;font-size:13px;word-break:break-word;">${esc(
          v
        )}</td></tr>`
    )
    .join("");
  const stackHtml = stack
    ? `<pre style="background:${LINEN};border:1px solid ${BORDER};border-radius:8px;padding:12px;font-size:12px;color:${TEXT};overflow:auto;white-space:pre-wrap;">${esc(
        stack
      )}</pre>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:${LINEN};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="background:${INK};padding:16px 24px;color:${LINEN};font-size:18px;font-weight:700;">⚠️ Noosho — user error</td></tr>
    <tr><td style="padding:20px 24px;">
      <p style="font-size:14px;color:${MUTED};margin:0 0 16px;">A user hit an issue. Details for troubleshooting:</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;border-collapse:separate;">${rowsHtml}</table>
      ${stackHtml ? `<p style="font-size:12px;font-weight:600;color:${TEXT};margin:18px 0 6px;">Stack trace</p>${stackHtml}` : ""}
    </td></tr>
  </table>
</body></html>`;

  return sendMail({
    to: recipients.map((address) => ({ address, name: "Admin" })),
    subject: `⚠️ Noosho error in ${ctx.route}: ${message.slice(0, 80)}`,
    html,
    label: "admin-error",
  });
}

/** Delivers a contact-form message to the team inbox, with reply-to set to the
 *  sender so a reply goes straight back to them. Spam defenses (honeypot, rate
 *  limit) live in the /api/contact route. */
export async function sendContactMessage(data: {
  name: string;
  email: string;
  message: string;
}): Promise<{ ok: boolean }> {
  // Contact-form messages route to the shared inbox (which forwards to Gmail),
  // overridable via CONTACT_TO.
  const to = [process.env.CONTACT_TO || "designs@noosho.com"];

  const rows: [string, string][] = [
    ["Name", data.name],
    ["Email", data.email],
  ];
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;color:${TEXT};white-space:nowrap;">${esc(
          k
        )}</td><td style="padding:6px 12px;color:${MUTED};">${esc(v)}</td></tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:${LINEN};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="background:${INK};padding:16px 24px;color:${LINEN};font-size:18px;font-weight:700;">✉️ Noosho — contact form</td></tr>
    <tr><td style="padding:20px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;border-collapse:separate;margin-bottom:16px;">${rowsHtml}</table>
      <p style="font-size:12px;font-weight:600;color:${TEXT};margin:0 0 6px;">Message</p>
      <pre style="background:${LINEN};border:1px solid ${BORDER};border-radius:8px;padding:12px;font-size:14px;color:${TEXT};white-space:pre-wrap;font-family:inherit;margin:0;">${esc(
        data.message
      )}</pre>
    </td></tr>
  </table>
</body></html>`;

  return sendMail({
    to: to.map((address) => ({ address, name: "Noosho" })),
    replyTo: { address: data.email, name: data.name },
    subject: `New contact message from ${data.name}`,
    html,
    label: "contact",
  });
}

/** Notifies the team of a new "book a decorator" waitlist lead. Reply-to is set
 *  to the lead so a reply goes straight to them. Never throws. */
export async function sendDecorLeadNotification(data: {
  email: string;
  phone?: string | null;
  eventLabel?: string | null;
  eventDate?: string | null;
  city?: string | null;
  locale?: string | null;
  designId?: string | null;
  quotedPriceMinor?: number | null;
  currency?: string | null;
  durationLabel?: string | null;
}): Promise<{ ok: boolean }> {
  const to = [process.env.CONTACT_TO || "designs@noosho.com"];

  const price =
    data.quotedPriceMinor != null
      ? formatAmount(data.quotedPriceMinor, data.currency || "inr")
      : "—";
  const designUrl = data.designId ? `${SITE_URL}/design/${data.designId}` : "—";
  const rows: [string, string][] = [
    ["Email", data.email],
    ["Phone", data.phone || "—"],
    ["Event", data.eventLabel || "—"],
    ["Event date", data.eventDate || "—"],
    ["City", data.city || "—"],
    ["Locale", data.locale || "—"],
    ["Quoted", `${price}${data.durationLabel ? ` · ${data.durationLabel}` : ""}`],
    ["Design", designUrl],
  ];
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;font-weight:600;color:${TEXT};white-space:nowrap;">${esc(
          k
        )}</td><td style="padding:6px 12px;color:${MUTED};">${esc(v)}</td></tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;background:${LINEN};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="background:${INK};padding:16px 24px;color:${LINEN};font-size:18px;font-weight:700;">🎉 Noosho — decorator waitlist lead</td></tr>
    <tr><td style="padding:20px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER};border-radius:10px;border-collapse:separate;">${rowsHtml}</table>
    </td></tr>
  </table>
</body></html>`;

  return sendMail({
    to: to.map((address) => ({ address, name: "Noosho" })),
    replyTo: { address: data.email },
    subject: `New decorator waitlist lead${data.eventLabel ? ` — ${data.eventLabel}` : ""}`,
    html,
    label: "decor-lead",
  });
}

/** Invite sent when an owner shares a private design with an email address.
 *  The recipient must sign in with Google using that same email to view. */
/**
 * "We made you a new design" — sent when an admin regenerates a design for a
 * user and sends it over.
 *
 * Deliberately NOT sendDesignReadyEmail: that one embeds the full-size render
 * plus every product with prices and buy links, which would hand over a paid
 * design's entire value in the email. Here the hero is CSS-blurred and the
 * product list withheld whenever the design is locked — the same treatment the
 * abandoned-checkout series uses.
 */
export async function sendAdminDesignEmail(data: {
  to: string;
  name?: string;
  designId: string;
  generatedImageUrl: string;
  eventLabel?: string;
  free: boolean;
  priceLabel?: string; // e.g. "₹99" — shown only when locked
  note?: string; // optional personal line from the admin
}): Promise<{ ok: boolean; suppressed?: boolean }> {
  if (!data.to) return { ok: false };
  // Promotional in tone and admin-initiated, so it honours the opt-out.
  if (await suppressed(data.to, "admin-design")) {
    return { ok: false, suppressed: true };
  }
  const link = `${SITE_URL}/design/${data.designId}`;
  const occasion = data.eventLabel ? esc(data.eventLabel) : "";
  const heroStyle = data.free
    ? "display:block;width:100%;height:auto;"
    : "display:block;width:100%;height:auto;filter:blur(7px);transform:scale(1.05);";

  const headline = data.free
    ? `We made you a new ${occasion || "design"} — on us 🎁`
    : `We made you a new ${occasion || "design"} ✨`;
  const lede = data.free
    ? `We weren't happy with how your last one turned out, so our team put together a fresh version${occasion ? ` for your ${occasion.toLowerCase()}` : ""}. It's unlocked and waiting — no charge.`
    : `Our team put together a fresh version${occasion ? ` for your ${occasion.toLowerCase()}` : ""}, with every piece picked and ready to shop. Take a look and unlock it whenever you're ready.`;

  const noteBlock = data.note
    ? `<tr><td style="padding:0 28px 4px;">
        <div style="border-left:3px solid ${CLAY};padding:10px 14px;background:${LINEN};border-radius:0 8px 8px 0;">
          <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;font-style:italic;">${esc(data.note)}</p>
        </div>
      </td></tr>`
    : "";

  const priceBlock =
    !data.free && data.priceLabel
      ? `<p style="font-size:13px;color:${MUTED};margin:14px 0 0;">Unlock the full design and shopping list for <strong style="color:${TEXT};">${esc(data.priceLabel)}</strong>.</p>`
      : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:${LINEN};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(headline)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:24px 12px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">
      <tr><td style="background:${INK};padding:18px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle"><img src="${esc(LOGO_URL)}" width="34" height="34" alt="Noosho" style="display:block;width:34px;height:34px;border-radius:9px;" /></td>
          <td valign="middle" style="padding-left:10px;"><span style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:${LINEN};">noosho</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 28px 0;">
        <p style="font-size:12px;font-weight:700;letter-spacing:0.10em;color:${CLAY_CTA};margin:0 0 8px;">${data.free ? "A NEW DESIGN, FREE" : "A NEW DESIGN FOR YOU"}</p>
        <h1 style="font-size:25px;font-weight:700;color:${TEXT};margin:0 0 10px;line-height:1.25;">${esc(headline)}</h1>
        <p style="font-size:15px;color:${MUTED};margin:0 0 18px;line-height:1.65;">${esc(lede)}</p>
      </td></tr>
      ${noteBlock}
      <tr><td style="padding:14px 28px 0;">
        <div style="border-radius:14px;overflow:hidden;border:1px solid ${BORDER};">
          <img src="${esc(data.generatedImageUrl)}" alt="Your new design" style="${heroStyle}" />
        </div>
      </td></tr>
      <tr><td style="padding:20px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:11px;background:${CLAY_CTA};">
          <a href="${esc(link)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${data.free ? "See your design" : "View and unlock"}</a>
        </td></tr></table>
        ${priceBlock}
      </td></tr>
      <tr><td style="padding:0 28px 24px;border-top:1px solid ${BORDER};">
        <p style="font-size:11px;color:${FAINT};margin:16px 0 0;line-height:1.6;">
          Sign in with this email address (${esc(data.to)}) to view it.<br />© ${new Date().getFullYear()} Noosho.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  return sendMail({
    to: { address: data.to, name: data.name },
    subject: data.free
      ? `A new ${data.eventLabel || "design"} for you — on us 🎁`
      : `We made you a new ${data.eventLabel || "design"} ✨`,
    html,
    unsubscribeUrl: unsubscribeUrl(data.to),
    label: "admin-design",
  });
}

export async function sendDesignShareInvite(data: {
  to: string;
  ownerName: string;
  designId: string;
}): Promise<{ ok: boolean }> {
  if (!data.to) return { ok: false };
  const link = `${SITE_URL}/design/${data.designId}`;
  const owner = esc(data.ownerName || "Someone");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:${LINEN};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="background:${INK};padding:16px 24px;">
      <span style="font-size:20px;font-weight:700;color:${LINEN};">noosho</span>
    </td></tr>
    <tr><td style="padding:24px;">
      <p style="font-size:16px;color:${TEXT};margin:0 0 8px;font-weight:600;">${owner} shared a design with you 🎨</p>
      <p style="font-size:14px;color:${MUTED};margin:0 0 18px;line-height:1.6;">
        They made a room design on Noosho and invited you to see it — the full
        transformation with every product pinned and shoppable.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${CLAY_CTA};">
        <a href="${esc(link)}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View the design</a>
      </td></tr></table>
      <p style="font-size:12px;color:${FAINT};margin:18px 0 0;line-height:1.6;">
        This design is private. Sign in with Google using this email address
        (${esc(data.to)}) to view it.
      </p>
    </td></tr>
  </table>
</body></html>`;

  // Transactional — a person-to-person invite the owner explicitly triggered.
  return sendMail({
    to: { address: data.to },
    subject: `${data.ownerName || "Someone"} shared a Noosho design with you`,
    html,
    label: "share-invite",
  });
}

export async function sendEventReminderEmail(
  data: EventReminderEmailData
): Promise<{ ok: boolean; suppressed?: boolean }> {
  if (!data.to) return { ok: false };
  if (await suppressed(data.to, "event-reminder")) {
    return { ok: false, suppressed: true };
  }

  const honoreeText = data.honoree ? ` for ${data.honoree}` : "";
  return sendMail({
    to: { address: data.to, name: data.name },
    subject:
      data.daysUntil <= 1
        ? `Your ${data.eventLabel}${honoreeText} is ${data.daysUntil === 0 ? "today" : "tomorrow"}! 🎉`
        : `${data.daysUntil} days until your ${data.eventLabel}${honoreeText} 🎉`,
    html: buildEventReminderHtml(data),
    unsubscribeUrl: unsubscribeUrl(data.to),
    label: "event-reminder",
  });
}

// ─── Festival campaign ───
// The shared calendar, not a user's own saved event. Three sends per festival,
// and the copy escalates on ONE axis: how much time is left to actually receive
// the physical decorations. Nothing is sent inside 5 days — a "3 days to go"
// email drives an order that cannot arrive, which is a refund and a bad review
// rather than a sale.

export interface FestivalCampaignEmailData {
  to: string;
  name?: string | null;
  eventLabel: string;
  eventDate: string;
  daysBefore: number;
  emoji: string;
  /** Gallery-approved designs only — see getFestivalInspiration. */
  inspiration?: { id: string; imageUrl: string; subTheme: string | null }[];
}

const FESTIVAL_TIERS: Record<
  number,
  { kicker: string; subject: (l: string, d: number) => string; lead: string; nudge: string }
> = {
  20: {
    kicker: "PLAN AHEAD",
    subject: (l) => `${l} is 3 weeks away — plan the look now`,
    lead: "You have plenty of time, which is exactly when the good decorations are still in stock and the cheapest delivery is still an option.",
    nudge: "Design it now, order at your own pace.",
  },
  10: {
    kicker: "TIME TO ORDER",
    subject: (l, d) => `${d} days to ${l} — order now to be safe`,
    lead: "This is the sweet spot. Design the space today and standard delivery still arrives comfortably before the day.",
    nudge: "Lock in your look while delivery is still relaxed.",
  },
  5: {
    kicker: "LAST ORDER WINDOW",
    subject: (l, d) => `Final call: ${d} days to ${l} 🚚`,
    lead: "This is the last realistic window for your decorations to actually arrive in time. Order after this and delivery becomes a gamble.",
    nudge: "Design it today so your products land before the day.",
  },
};

export function buildFestivalCampaignHtml(
  data: FestivalCampaignEmailData
): string {
  const firstName = data.name ? esc(data.name.split(" ")[0]) : "there";
  const tier = FESTIVAL_TIERS[data.daysBefore] ?? FESTIVAL_TIERS[10];
  const dateFormatted = new Date(data.eventDate).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });
  const createUrl = `${SITE_URL}/create`;

  // Showing what the product actually produces beats describing it. Omitted
  // entirely when there is nothing approved to show, rather than shipping an
  // empty frame or a placeholder.
  const shots = (data.inspiration ?? []).slice(0, 3);
  const inspirationBlock = shots.length
    ? `
        <tr><td style="padding:0 28px 8px;">
          <div style="font-size:13px;font-weight:700;color:${TEXT};margin:0 0 10px;">Made on Noosho for ${esc(data.eventLabel)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${shots
  .map(
    (s) => `            <td width="33%" valign="top" style="padding:0 4px;">
              <a href="${esc(`${SITE_URL}/design/${s.id}`)}" style="text-decoration:none;">
                <img src="${esc(s.imageUrl)}" width="176" alt="${esc(data.eventLabel)} design${s.subTheme ? ` — ${esc(s.subTheme)}` : ""}" style="display:block;width:100%;max-width:176px;height:auto;border-radius:10px;border:1px solid ${BORDER};" />
              </a>
            </td>`
  )
  .join("\n")}
          </tr></table>
        </td></tr>
`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /></head>
<body style="margin:0;padding:0;background:${LINEN};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(tier.lead)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">

        <tr><td style="background:${INK};padding:18px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle"><img src="${esc(LOGO_URL)}" width="34" height="34" alt="Noosho" style="display:block;width:34px;height:34px;border-radius:9px;" /></td>
            <td valign="middle" style="padding-left:10px;"><span style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:${LINEN};">noosho</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:28px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.10em;color:${CLAY_CTA};margin:0 0 8px;">${tier.kicker}</div>
          <h1 style="font-size:25px;font-weight:700;color:${TEXT};margin:0 0 8px;letter-spacing:-0.02em;line-height:1.25;">
            ${data.emoji} ${esc(data.eventLabel)} is in ${data.daysBefore} days
          </h1>
          <p style="font-size:15px;color:${MUTED};margin:0 0 20px;line-height:1.6;">Hi ${firstName}, it falls on ${dateFormatted}. ${esc(tier.lead)}</p>
        </td></tr>
${inspirationBlock}
        <tr><td style="padding:16px 28px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};border-radius:14px;border:1px solid ${BORDER};">
            <tr><td style="padding:22px 24px;">
              <div style="font-size:17px;font-weight:700;color:${TEXT};margin:0 0 6px;">${esc(tier.nudge)}</div>
              <div style="font-size:14px;color:${MUTED};line-height:1.6;margin:0 0 18px;">
                Upload one photo of your space. Noosho designs the ${esc(data.eventLabel)} decorations on it, then lines up the exact products so you can order them in a couple of taps.
              </div>
              <a href="${esc(createUrl)}" style="display:inline-block;background:${CLAY_CTA};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:11px;">Design my ${esc(data.eventLabel)} →</a>
            </td></tr>
          </table>
        </td></tr>

${footerBlock({
  reason: `You&rsquo;re receiving this because you have a Noosho account. We only send these for major festivals, and never in the last few days before one.`,
  unsubUrl: unsubscribeUrl(data.to),
  padding: "8px 28px 28px",
})}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendFestivalCampaignEmail(
  data: FestivalCampaignEmailData
): Promise<{ ok: boolean; suppressed?: boolean }> {
  if (!data.to) return { ok: false };
  if (await suppressed(data.to, "festival-campaign")) {
    return { ok: false, suppressed: true };
  }
  const tier = FESTIVAL_TIERS[data.daysBefore] ?? FESTIVAL_TIERS[10];
  return sendMail({
    to: { address: data.to, name: data.name ?? undefined },
    subject: tier.subject(data.eventLabel, data.daysBefore),
    html: buildFestivalCampaignHtml(data),
    unsubscribeUrl: unsubscribeUrl(data.to),
    label: "festival-campaign",
  });
}

/** One-time passwordless sign-in link. */
export async function sendMagicLinkEmail(data: {
  to: string;
  link: string;
}): Promise<{ ok: boolean }> {
  if (!data.to) return { ok: false };

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:${LINEN};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
    <tr><td style="background:${INK};padding:16px 24px;">
      <span style="font-size:20px;font-weight:700;color:${LINEN};">noosho</span>
    </td></tr>
    <tr><td style="padding:24px;">
      <p style="font-size:16px;color:${TEXT};margin:0 0 8px;font-weight:600;">Sign in to Noosho</p>
      <p style="font-size:14px;color:${MUTED};margin:0 0 18px;line-height:1.6;">
        Tap the button below to sign in and see your design. This link works once
        and expires in 15 minutes.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${CLAY_CTA};">
        <a href="${esc(data.link)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Sign in to Noosho</a>
      </td></tr></table>
      <p style="font-size:12px;color:${FAINT};margin:18px 0 0;line-height:1.6;">
        If you didn't request this, you can safely ignore this email — no one can
        sign in without this link.
      </p>
    </td></tr>
  </table>
</body></html>`;

  // Transactional — a sign-in link must never be suppressed by a marketing
  // opt-out, or opting out would lock the user out of their account.
  return sendMail({
    to: { address: data.to },
    subject: "Your Noosho sign-in link",
    html,
    label: "magic-link",
  });
}

// ─── Activation funnel (signed up, never designed) ───
// Staged nudges for users who created an account but never made a design. The
// series self-cancels: the cron's candidate query excludes anyone who has a
// design, so creating one silently ends the funnel.

export interface ActivationEmailData {
  to: string;
  name?: string | null;
  stage: 1 | 2 | 3;
}

const ACTIVATION_COPY: Record<
  1 | 2 | 3,
  { eyebrow: string; subject: string; title: string; body: string; cta: string }
> = {
  1: {
    eyebrow: "YOU'RE ALL SET",
    subject: "Your first design is one photo away 📸",
    title: "Ready when you are",
    body: "Your account is set up — all that's left is a photo. Snap any room or venue and Noosho will restyle it and line up every piece to shop.",
    cta: "Design your first room →",
  },
  2: {
    eyebrow: "TAKES ABOUT A MINUTE",
    subject: "Still thinking about it? Here's how it works 🛋️",
    title: "One photo, one minute",
    body: "Upload a photo, pick the pieces you want, and you'll get a full redesign with real, buyable products pinned to it. No measuring, no planning, no signup steps left.",
    cta: "Try it now →",
  },
  3: {
    eyebrow: "LAST NUDGE",
    subject: "Your Noosho account is waiting 👋",
    title: "We'll leave you to it",
    body: "This is the last reminder we'll send. Your account stays ready whenever you want to try it — it only takes one photo to see what your space could look like.",
    cta: "Design a room →",
  },
};

export function buildActivationHtml(data: ActivationEmailData): string {
  const c = ACTIVATION_COPY[data.stage];
  const greeting = data.name ? `Hi ${esc(data.name.split(" ")[0])},` : "Hi there,";
  const createUrl = `${SITE_URL}/create`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /></head>
<body style="margin:0;padding:0;background:${LINEN};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(c.body)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">

        <tr><td style="background:${INK};padding:18px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle"><img src="${esc(LOGO_URL)}" width="34" height="34" alt="Noosho" style="display:block;width:34px;height:34px;border-radius:9px;" /></td>
            <td valign="middle" style="padding-left:10px;"><span style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:${LINEN};">noosho</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:28px 28px 0;">
          <p style="font-size:11px;letter-spacing:0.12em;font-weight:700;color:${CLAY};margin:0 0 10px;">${esc(c.eyebrow)}</p>
          <h1 style="font-size:26px;line-height:1.25;font-weight:700;color:${TEXT};margin:0 0 12px;letter-spacing:-0.02em;">${esc(c.title)}</h1>
          <p style="font-size:15px;line-height:1.65;color:${MUTED};margin:0 0 6px;">${greeting}</p>
          <p style="font-size:15px;line-height:1.65;color:${MUTED};margin:0;">${esc(c.body)}</p>
        </td></tr>

        <tr><td style="padding:24px 28px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:11px;background:${CLAY_CTA};">
            <a href="${esc(createUrl)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(c.cta)}</a>
          </td></tr></table>
        </td></tr>

${footerBlock({
          reason:
            "You're receiving this because you created a Noosho account.",
          unsubUrl: unsubscribeUrl(data.to),
          padding: "22px 28px 28px",
        })}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendActivationEmail(
  data: ActivationEmailData
): Promise<{ ok: boolean; suppressed?: boolean }> {
  if (!data.to) return { ok: false };
  if (await suppressed(data.to, "activation")) {
    return { ok: false, suppressed: true };
  }
  return sendMail({
    to: { address: data.to, name: data.name },
    subject: ACTIVATION_COPY[data.stage].subject,
    html: buildActivationHtml(data),
    unsubscribeUrl: unsubscribeUrl(data.to),
    label: `activation-${data.stage}`,
  });
}

export interface AbandonedCheckoutEmailData {
  to: string;
  name?: string;
  designId: string;
  generatedImageUrl: string;
  designNarrative?: string | null;
  amount: number; // smallest currency unit
  currency: string;
  stage: 1 | 2 | 3; // 1=day1, 2=day3, 3=final/day4
  /** The cron always selected d.mode but never passed it, so someone who
   *  abandoned a birthday design was told to finish their "room redesign". */
  mode?: AppMode | string | null;
}

interface AbandonCopy {
  eyebrow: string;
  subject: string;
  title: string;
  body: string;
}

function abandonCopy(stage: 1 | 2 | 3, isEvent: boolean): AbandonCopy {
  const thing = isEvent ? "decorations" : "room";
  switch (stage) {
    case 1:
      return {
        eyebrow: "YOUR DESIGN IS WAITING",
        subject: "Your design is still waiting ✨",
        title: "You're one step from the full look",
        body: `You started unlocking your design but didn't finish. It's saved and ready — unlock it to see the full ${
          isEvent ? "setup" : "room"
        } and shop every piece.`,
      };
    case 2:
      return {
        eyebrow: "DON'T LOSE YOUR DESIGN",
        subject: isEvent
          ? "Still want your event decorations? 🎉"
          : "Still want your room redesign? 🛋️",
        title: "Your design — and shopping list — are ready",
        body: `Unlock to reveal the full-resolution design, the before & after, and live buy links for every piece in the ${thing}.`,
      };
    case 3:
      return {
        eyebrow: "LAST CHANCE · 20% OFF",
        subject: "Last chance — here's 20% off your design",
        title: "Your final reminder — and a discount",
        body: "This is the last nudge we'll send. To make it easy, here's 20% off — unlock now to see the full look and shop every piece before it slips off your list.",
      };
  }
}

// Final (day-4) reminder carries a last-chance discount code. The matching
// coupon must exist in the admin coupon manager for it to actually apply.
const FINAL_COUPON_CODE = process.env.ABANDON_FINAL_COUPON || "DESIGN20";
const FINAL_COUPON_PCT = 20;

export function buildAbandonedCheckoutHtml(data: AbandonedCheckoutEmailData): string {
  const c = abandonCopy(data.stage, data.mode === "event");
  const greeting = data.name ? `Hi ${esc(data.name.split(" ")[0])},` : "Hi there,";
  const isFinal = data.stage === 3;
  // Final email pre-applies the discount via the link so it's auto-filled.
  const designUrl = isFinal
    ? `${SITE_URL}/design/${data.designId}?coupon=${FINAL_COUPON_CODE}`
    : `${SITE_URL}/design/${data.designId}`;
  const priceLabel = formatAmount(data.amount, data.currency);
  const discountedLabel = formatAmount(
    Math.round(data.amount * (1 - FINAL_COUPON_PCT / 100)),
    data.currency
  );

  const couponBanner = isFinal
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
         <tr><td align="center" style="background:${LINEN};border:1px dashed ${CLAY};border-radius:12px;padding:16px 18px;">
           <div style="font-size:13px;color:${MUTED};margin:0 0 4px;">Your last-chance offer — ${FINAL_COUPON_PCT}% off</div>
           <div style="font-size:22px;font-weight:800;letter-spacing:0.04em;color:${CLAY_CTA};">${esc(FINAL_COUPON_CODE)}</div>
           <div style="font-size:12px;color:${FAINT};margin-top:4px;">Applied automatically when you tap below</div>
         </td></tr>
       </table>`
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

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /></head>
<body style="margin:0;padding:0;background:${LINEN};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${esc(c.body)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LINEN};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${BORDER};">

        <tr><td style="background:${INK};padding:18px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td valign="middle"><img src="${esc(LOGO_URL)}" width="34" height="34" alt="Noosho" style="display:block;width:34px;height:34px;border-radius:9px;" /></td>
            <td valign="middle" style="padding-left:10px;"><span style="font-size:21px;font-weight:700;letter-spacing:-0.02em;color:${LINEN};">noosho</span></td>
          </tr></table>
        </td></tr>

        <tr><td style="padding:26px 28px 0;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.10em;color:${CLAY_CTA};margin:0 0 8px;">${c.eyebrow}</div>
          <h1 style="font-size:24px;font-weight:700;color:${TEXT};margin:0 0 8px;letter-spacing:-0.02em;line-height:1.25;">${esc(c.title)}</h1>
          <p style="font-size:15px;color:${MUTED};margin:0 0 18px;line-height:1.6;">${greeting} ${esc(c.body)}</p>
        </td></tr>

        <tr><td style="padding:0 28px;">
          <div style="position:relative;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};">
            <img src="${esc(data.generatedImageUrl)}" alt="Your design preview" width="544" style="display:block;width:100%;height:auto;filter:blur(7px);transform:scale(1.05);" />
          </div>
        </td></tr>

        <tr><td style="padding:22px 28px 4px;">
          ${narrative}
          ${couponBanner}
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:11px;background:${CLAY_CTA};">
            <a href="${esc(designUrl)}" style="display:inline-block;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:11px;">${
              isFinal
                ? `Unlock for ${esc(discountedLabel)} (was ${esc(priceLabel)}) →`
                : `Unlock for ${esc(priceLabel)} →`
            }</a>
          </td></tr></table>
          <p style="font-size:12px;color:${FAINT};margin:12px 0 0;">Secure checkout via Stripe · One-time payment</p>
        </td></tr>

${footerBlock({
          reason:
            "You're receiving this because you started unlocking a design on Noosho.",
          unsubUrl: unsubscribeUrl(data.to),
          disclosure: true,
          padding: "26px 28px 28px",
        })}

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendAbandonedCheckoutEmail(
  data: AbandonedCheckoutEmailData
): Promise<{ ok: boolean; suppressed?: boolean }> {
  if (!data.to) return { ok: false };
  // Belt-and-braces: getDueCheckoutReminders already excludes opted-out
  // addresses. `suppressed` is reported separately from `ok` so the cron
  // retires the stage instead of retrying it every night forever.
  if (await suppressed(data.to, "abandoned-checkout")) {
    return { ok: false, suppressed: true };
  }
  return sendMail({
    to: { address: data.to, name: data.name },
    subject: abandonCopy(data.stage, data.mode === "event").subject,
    html: buildAbandonedCheckoutHtml(data),
    unsubscribeUrl: unsubscribeUrl(data.to),
    label: "abandoned-checkout",
  });
}

/**
 * Send the "your design is ready" email via Zoho ZeptoMail.
 * Never throws — returns { ok } and logs failures so callers (save-design)
 * are never broken by a mail problem.
 */
export async function sendDesignReadyEmail(
  data: DesignReadyEmailData
): Promise<{ ok: boolean }> {
  if (!data.to) return { ok: false };

  const isEvent = data.mode === "event";
  // Transactional: this is the thing the user paid for, so it is deliberately
  // not gated on the marketing opt-out.
  return sendMail({
    to: { address: data.to, name: data.name },
    subject: isEvent
      ? `Your ${data.eventConfig?.eventLabel || "event"} design is ready 🎉`
      : "Your room redesign is ready ✨",
    html: buildDesignReadyHtml(data),
    label: "design-ready",
  });
}
