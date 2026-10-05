// The friendly Google account brokers share private sheets with —
// sheets@idriveus.com (an alias on Drive's mailbox, with its own free Google
// account). An admin connects it once at /admin/google-reader; its refresh
// token (table google_reader, server-only) gets short-lived read-only
// access tokens for reading sheets shared with it. SERVER-ONLY.
//
// The OAuth client is "Drive sheet connect" in the Google Cloud project
// behind lib/google-service-account.ts; its secret is
// GOOGLE_OAUTH_CLIENT_SECRET.
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

export const READER_EMAIL = "sheets@idriveus.com";
const CLIENT_ID = "580987260363-g2dcf35obdtshv24qmnmpe2gt77itm6a.apps.googleusercontent.com";
const SCOPE = "openid email https://www.googleapis.com/auth/spreadsheets.readonly";

export function readerRedirectUri(): string {
  return `${SITE_URL}/api/google-reader/callback`;
}

export function readerAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: readerRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    login_hint: READER_EMAIL,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function clientSecret(): string | null {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null;
}

export function isReaderConfigured(): boolean {
  return Boolean(clientSecret());
}

// Trades the sign-in code for tokens; returns the signed-in email and the
// refresh token, or an error message.
export async function exchangeReaderCode(
  code: string
): Promise<{ ok: true; email: string; refreshToken: string } | { ok: false; error: string }> {
  const secret = clientSecret();
  if (!secret) return { ok: false, error: "GOOGLE_OAUTH_CLIENT_SECRET isn't set." };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: secret,
      redirect_uri: readerRedirectUri(),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as {
    refresh_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !body) return { ok: false, error: body?.error_description ?? body?.error ?? `HTTP ${res.status}` };
  if (!body.refresh_token) return { ok: false, error: "Google didn't return a refresh token — try again." };
  // The id_token came straight from Google over TLS; only its email is read.
  let email = "";
  try {
    const payload = JSON.parse(Buffer.from((body.id_token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    email = String(payload.email ?? "").toLowerCase();
  } catch {
    // handled below
  }
  if (!email) return { ok: false, error: "Couldn't tell which Google account signed in." };
  return { ok: true, email, refreshToken: body.refresh_token };
}

export async function saveReader(email: string, refreshToken: string, connectedBy: string): Promise<string | null> {
  const { error } = await createAdminClient()
    .from("google_reader")
    .upsert({ id: 1, email, refresh_token: refreshToken, connected_by: connectedBy, updated_at: new Date().toISOString() });
  cachedToken = null;
  return error?.message ?? null;
}

// Once per request: the connected reader (email + when), or null.
export const readerStatus = cache(async (): Promise<{ email: string; updatedAt: string } | null> => {
  try {
    const { data } = await createAdminClient()
      .from("google_reader")
      .select("email, updated_at")
      .eq("id", 1)
      .maybeSingle<{ email: string; updated_at: string }>();
    return data ? { email: data.email, updatedAt: data.updated_at } : null;
  } catch {
    return null;
  }
});

// The address brokers should share with: the friendly account once it's
// connected (and the secret is set), else the fallback (the service account).
export async function shareEmail(fallback: string | null): Promise<string | null> {
  return isReaderConfigured() && (await readerStatus()) ? READER_EMAIL : fallback;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

// A read-only Sheets access token for the reader account, or null when it
// isn't connected or Google refuses (logged).
export async function readerAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const secret = clientSecret();
  if (!secret) return null;
  const { data } = await createAdminClient()
    .from("google_reader")
    .select("refresh_token")
    .eq("id", 1)
    .maybeSingle<{ refresh_token: string }>();
  if (!data) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: secret,
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !body?.access_token) {
      console.error("Google reader token refresh failed:", res.status, body?.error ?? "");
      return null;
    }
    cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return cachedToken.token;
  } catch (err) {
    console.error("Google reader token refresh threw:", err instanceof Error ? err.message : err);
    return null;
  }
}
