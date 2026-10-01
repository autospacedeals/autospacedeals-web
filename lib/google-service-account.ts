// Server-only: signs in to Google as Drive's service account
// (GOOGLE_SERVICE_ACCOUNT_JSON — the JSON key file's contents) so private
// Google Sheets a broker has shared with that account's email can be read.
// No Google SDK: the access token comes from a JWT signed with Node's own
// crypto, the standard service-account flow.
import { createSign } from "node:crypto";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedKey: ServiceAccountKey | null | undefined;

function readKey(): ServiceAccountKey | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  cachedKey = null;
  if (!raw) return null;
  try {
    // Accept the file's JSON as-is, or base64 of it.
    const parsed = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    if (typeof parsed?.client_email === "string" && typeof parsed?.private_key === "string") {
      cachedKey = {
        client_email: parsed.client_email,
        // Pasted keys sometimes carry literal "\n" instead of newlines.
        private_key: parsed.private_key.replace(/\\n/g, "\n"),
        token_uri: typeof parsed.token_uri === "string" ? parsed.token_uri : undefined,
      };
    } else {
      console.error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
    }
  } catch (err) {
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON isn't valid JSON:", err instanceof Error ? err.message : err);
  }
  return cachedKey;
}

// The email brokers share their private sheet with, or null when the
// service account isn't configured.
export function serviceAccountEmail(): string | null {
  return readKey()?.client_email ?? null;
}

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// A read-only Drive access token, reused until shortly before it expires.
// Null when not configured or Google refuses (logged).
export async function serviceAccountToken(): Promise<string | null> {
  const key = readKey();
  if (!key) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    base64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
  try {
    const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
    const res = await fetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${base64url(signature)}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
    if (!res.ok || !body?.access_token) {
      console.error("Google service account sign-in failed:", res.status, body?.error ?? "");
      return null;
    }
    cachedToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return cachedToken.token;
  } catch (err) {
    console.error("Google service account sign-in threw:", err instanceof Error ? err.message : err);
    return null;
  }
}
