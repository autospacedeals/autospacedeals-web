// Twilio, through its REST API with plain fetch (no SDK). SERVER-ONLY: reads
// TWILIO_AUTH_TOKEN. Setup steps are in TOOLS-AND-SERVICES.md ("Text
// messages"). Everything here quietly does nothing until the env vars are
// set, and the "Text me new messages" setting stays hidden until then.
//
//   TWILIO_ACCOUNT_SID            — the account (AC…)
//   TWILIO_AUTH_TOKEN             — its auth token (also signs incoming webhooks)
//   TWILIO_MESSAGING_SERVICE_SID  — the Messaging Service (MG…) holding Drive's number
//   TWILIO_VERIFY_SERVICE_SID     — the Verify service (VA…) that sends confirmation codes
import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/site";

const TIMEOUT_MS = 10000;

function env() {
  return {
    sid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? "",
    token: process.env.TWILIO_AUTH_TOKEN?.trim() ?? "",
    messaging: process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "",
    verify: process.env.TWILIO_VERIFY_SERVICE_SID?.trim() ?? "",
  };
}

export function isSmsConfigured(): boolean {
  const e = env();
  return Boolean(e.sid && e.token && e.messaging && e.verify);
}

// "(949) 555-1234" / "949-555-1234" / "+1 949 555 1234" -> "+19495551234".
export function toE164(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? `+1${digits}` : null;
}

// "+19495551234" -> "(949) 555-1234" for display.
export function formatE164(phone: string | null | undefined): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (phone ?? "");
}

async function twilioPost(url: string, params: Record<string, string>): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null }> {
  const { sid, token } = env();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.error("Twilio request failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 0, body: null };
  }
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isSmsConfigured()) return false;
  const { sid, messaging } = env();
  const res = await twilioPost(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    MessagingServiceSid: messaging,
    To: to,
    Body: body.slice(0, 1200),
  });
  if (!res.ok) console.error("Twilio send failed:", res.status, res.body?.message ?? "");
  return res.ok;
}

// Texts a 6-digit confirmation code (Twilio Verify).
export async function startVerification(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSmsConfigured()) return { ok: false, error: "Texts aren't set up yet." };
  const { verify } = env();
  const res = await twilioPost(`https://verify.twilio.com/v2/Services/${verify}/Verifications`, { To: to, Channel: "sms" });
  if (res.ok) return { ok: true };
  console.error("Twilio Verify start failed:", res.status, res.body?.message ?? "");
  // 60200 invalid number, 60203 too many attempts, 60205 landline.
  const code = Number(res.body?.code);
  if (code === 60203) return { ok: false, error: "Too many codes sent to this number — try again in a few minutes." };
  if (code === 60205 || code === 60200) return { ok: false, error: "That number can't receive texts. Use a mobile number." };
  return { ok: false, error: "We couldn't text a code right now. Please try again." };
}

export async function checkVerification(to: string, code: string): Promise<boolean> {
  if (!isSmsConfigured()) return false;
  const { verify } = env();
  const res = await twilioPost(`https://verify.twilio.com/v2/Services/${verify}/VerificationCheck`, { To: to, Code: code });
  return res.ok && res.body?.status === "approved";
}

// The public URL Twilio posts incoming texts to — what its signature is
// computed over. TWILIO_WEBHOOK_URL overrides it if the site moves.
export function smsWebhookUrl(): string {
  return process.env.TWILIO_WEBHOOK_URL?.trim() || `${SITE_URL.replace(/\/+$/, "")}/api/twilio/sms`;
}

// Twilio signs each webhook: base64(HMAC-SHA1(auth token, URL + every POST
// param's name and value, sorted by name)).
export function isValidTwilioSignature(signature: string | null, url: string, params: Record<string, string>): boolean {
  const { token } = env();
  if (!signature || !token) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
