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

// The key file's JSON, however it was pasted into the env var: as-is,
// wrapped in quotes or escaped as a JSON string, with stray text around
// the braces, or base64-encoded.
function parseKeyJson(raw: string): Record<string, unknown> | null {
  const attempt = (text: string): Record<string, unknown> | null => {
    try {
      let value: unknown = JSON.parse(text);
      // An escaped copy ("{\"type\": ...}") parses to a string first.
      if (typeof value === "string") value = JSON.parse(value);
      return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const between = (text: string) => {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
  };
  const candidates = [raw, between(raw)];
  if (!raw.includes("{")) {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    candidates.push(decoded, between(decoded));
  }
  for (const text of candidates) {
    const parsed = text ? attempt(text) : null;
    if (parsed) return parsed;
  }
  return null;
}

function readKey(): ServiceAccountKey | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  cachedKey = null;
  if (!raw) return null;
  const parsed = parseKeyJson(raw);
  if (parsed && typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
    cachedKey = {
      client_email: parsed.client_email,
      // Pasted keys sometimes carry literal "\n" instead of newlines.
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
      token_uri: typeof parsed.token_uri === "string" ? parsed.token_uri : undefined,
    };
  } else {
    // Describe the value's shape only — never log the key itself.
    console.error(
      `GOOGLE_SERVICE_ACCOUNT_JSON couldn't be read as a service-account key (length ${raw.length}, ` +
        `starts with char code ${raw.charCodeAt(0)}, has "{": ${raw.includes("{")}, ` +
        `has "private_key": ${raw.includes("private_key")}, has client_email: ${raw.includes("client_email")})`
    );
  }
  return cachedKey;
}

// The email brokers share their private sheet with, or null when the
// service account isn't configured.
export function serviceAccountEmail(): string | null {
  return readKey()?.client_email ?? null;
}

// Drive for exports, Sheets for reading a sheet's cells (which works even
// when the owner turned off downloads for viewers).
const SCOPE = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly";
let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// A read-only Drive/Sheets access token, reused until shortly before it expires.
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
