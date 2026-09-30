// Transactional email through Resend's REST API (https://resend.com/docs/api-reference/emails/send-email),
// called with plain fetch so there's no SDK dependency. SERVER-ONLY: reads
// RESEND_API_KEY, which must never reach the browser — only import this
// from route handlers, server actions and other server-only modules.
// Setup (API key, sender address, verifying idriveus.com) is in
// TOOLS-AND-SERVICES.md.
//
// Also holds the shared email building blocks: an HTML-escape helper, a
// plain light-background layout, and a deal-list block (photo, title,
// price, due at signing, term, location, link) used by the saved-search
// alert emails (app/api/cron/search-alerts/route.ts). Every value that
// comes from the database — listing details are written by brokers — goes
// through escapeHtml() before it's placed in HTML.
//
// Colours here are literal hex values on purpose: email clients don't
// support CSS variables or stylesheets, so the site's design tokens can't
// be used. It's a light, dark-on-white palette because many clients
// (Outlook, Gmail's own dark mode) rewrite or ignore dark backgrounds.
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency, formatMileage, formatTerm } from "@/lib/deal-utils";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Drive <alerts@idriveus.com>";
const SEND_TIMEOUT_MS = 15000;

// `status` is Resend's HTTP status when it answered with an error (absent
// for timeouts and network failures), so callers can tell a rate limit
// (429) apart from a rejected message.
export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; status?: number };

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Extra headers, e.g. List-Unsubscribe.
  headers?: Record<string, string>;
  // Resend drops a repeat send with the same key (for 24 hours) instead of
  // delivering it twice — for jobs that might retry.
  idempotencyKey?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

// Loose on purpose (the auth provider already validated the address); this
// only has to keep header-breaking characters and obvious junk out.
function isSendableAddress(address: string): boolean {
  return address.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(address);
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "not configured" };

  const to = input.to.trim();
  if (!isSendableAddress(to)) return { ok: false, error: "invalid recipient" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey.slice(0, 256);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: singleLine(process.env.RESEND_FROM_EMAIL || DEFAULT_FROM),
        to: [to],
        subject: singleLine(input.subject).slice(0, 200),
        html: input.html,
        text: input.text,
        ...(input.headers ? { headers: input.headers } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | { id?: unknown; message?: unknown; name?: unknown }
      | null;
    if (!response.ok) {
      const detail = typeof body?.message === "string" ? body.message : response.statusText;
      return {
        ok: false,
        error: `Resend ${response.status}: ${detail}`.slice(0, 300),
        status: response.status,
      };
    }
    return { ok: true, id: typeof body?.id === "string" ? body.id : null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

// -----------------------------------------------------------------------------
// Templates
// -----------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// For text content and attribute values alike (attributes are always
// double-quoted below).
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// SITE_URL plus a path, for links in emails (which need absolute URLs).
export function siteLink(path: string): string {
  return `${SITE_URL.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function dealLink(deal: Pick<Deal, "slug">): string {
  return siteLink(`/deals/${encodeURIComponent(deal.slug)}`);
}

// An absolute http(s) URL for a listing's first photo, or null when there
// isn't one worth showing: the SVG placeholder (most email clients don't
// render SVG) or anything that isn't a plain web URL.
function dealImageUrl(deal: Deal): string | null {
  const src = deal.images?.[0];
  if (!src || typeof src !== "string") return null;
  const absolute = src.startsWith("/") && !src.startsWith("//") ? siteLink(src) : src;
  if (!/^https?:\/\//i.test(absolute) || /\.svg(\?|#|$)/i.test(absolute)) return null;
  return absolute;
}

function priceLine(deal: Deal): { amount: string; unit: string } {
  if (deal.onePay) return { amount: formatCurrency(deal.dueAtSigning), unit: "one-pay total" };
  return {
    amount: formatCurrency(deal.payment),
    unit: deal.paymentTaxRate ? `/mo (incl. ~${deal.paymentTaxRate}% tax)` : "/mo + tax",
  };
}

function detailsLine(deal: Deal): string {
  const parts: string[] = [];
  if (!deal.onePay) parts.push(`${formatCurrency(deal.dueAtSigning)} due at signing`);
  if (deal.term > 0) parts.push(formatTerm(deal.term));
  if (deal.milesPerYear) parts.push(formatMileage(deal.milesPerYear));
  const place = [deal.city, deal.state].filter(Boolean).join(", ");
  if (place) parts.push(place);
  return parts.join(" · ");
}

function photoNote(deal: Deal): string | null {
  if (deal.sample) return "Sample listing — photo not exact vehicle";
  if (deal.photoAutoSourced) return "Stock photo — may not be exact vehicle";
  return null;
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#111318";
const INK_SECONDARY = "#3d434f";
const INK_MUTED = "#5f6673";
const HAIRLINE = "#e3e6eb";
const ACCENT = "#1f5ae0";

// A table with one block per deal: photo on top, then title, price and
// details, each linking to the deal page. Table-based layout with inline
// styles, the only thing every email client renders reliably. Sized for
// emailLayoutHtml's 536px content column.
export function dealListEmailHtml(deals: Deal[]): string {
  const rows = deals
    .map((deal) => {
      const url = escapeHtml(dealLink(deal));
      const title = escapeHtml(dealTitle(deal));
      const image = dealImageUrl(deal);
      const note = photoNote(deal);
      const { amount, unit } = priceLine(deal);
      return `
<tr><td style="padding:0 0 24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${HAIRLINE};border-radius:12px;border-collapse:separate;overflow:hidden;">
    ${
      image
        ? `<tr><td style="padding:0;"><a href="${url}"><img src="${escapeHtml(image)}" width="536" alt="${title}" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:12px 12px 0 0;" /></a></td></tr>`
        : ""
    }
    <tr><td style="padding:16px 20px 18px 20px;font-family:${FONT};">
      ${note ? `<p style="margin:0 0 8px 0;font-size:12px;line-height:16px;color:${INK_MUTED};">${escapeHtml(note)}</p>` : ""}
      <p style="margin:0;font-size:17px;line-height:24px;font-weight:600;"><a href="${url}" style="color:${INK};text-decoration:none;">${title}</a></p>
      <p style="margin:6px 0 0 0;font-size:15px;line-height:22px;color:${INK};"><span style="font-size:20px;font-weight:600;">${escapeHtml(amount)}</span> <span style="color:${INK_MUTED};">${escapeHtml(unit)}</span></p>
      <p style="margin:4px 0 0 0;font-size:14px;line-height:20px;color:${INK_SECONDARY};">${escapeHtml(detailsLine(deal))}</p>
      <p style="margin:12px 0 0 0;font-size:14px;line-height:20px;"><a href="${url}" style="color:${ACCENT};font-weight:600;text-decoration:none;">View deal &rarr;</a></p>
    </td></tr>
  </table>
</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

export function dealListEmailText(deals: Deal[]): string {
  return deals
    .map((deal) => {
      const { amount, unit } = priceLine(deal);
      const note = photoNote(deal);
      return [
        dealTitle(deal),
        `${amount} ${unit}`,
        detailsLine(deal),
        ...(note ? [note] : []),
        dealLink(deal),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

// The whole email around a body. `heading` and `preheader` are plain text
// (escaped here); `bodyHtml` and `footerHtml` must already be safe HTML —
// build them from escapeHtml()'d values and the helpers above.
export function emailLayoutHtml({
  preheader,
  heading,
  bodyHtml,
  footerHtml,
}: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  footerHtml: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f5f7;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:16px;">
      <tr><td style="padding:28px 32px 8px 32px;font-family:${FONT};">
        <p style="margin:0;font-size:15px;line-height:20px;font-weight:600;color:${INK};">${escapeHtml(SITE_NAME)}</p>
        <h1 style="margin:20px 0 0 0;font-size:22px;line-height:30px;font-weight:600;color:${INK};">${escapeHtml(heading)}</h1>
      </td></tr>
      <tr><td style="padding:16px 32px 8px 32px;font-family:${FONT};font-size:15px;line-height:22px;color:${INK_SECONDARY};">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:8px 32px 28px 32px;border-top:1px solid ${HAIRLINE};font-family:${FONT};font-size:12px;line-height:18px;color:${INK_MUTED};">
        ${footerHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Link styling for use inside bodyHtml / footerHtml.
export function emailLinkHtml(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${ACCENT};text-decoration:underline;">${escapeHtml(label)}</a>`;
}
