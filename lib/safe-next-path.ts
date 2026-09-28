// Validates a post-login `next` destination (e.g. /customer/login?next=
// /brokers/123#reviews) so the login flow can send someone back to the page
// they came from without becoming an open redirect. Only same-site relative
// paths are allowed: must start with a single "/" — never "//" or "/\"
// (both of which browsers treat as another host) — and no control
// characters or whitespace (browsers strip tabs/newlines from URLs, so
// "/\t/evil.com" would otherwise turn into "//evil.com"). Anything else
// returns null and the caller falls back to its normal default.
const MAX_NEXT_LENGTH = 512;

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const next = raw.trim();
  if (!next || next.length > MAX_NEXT_LENGTH) return null;
  if (!isSameSitePath(next)) return null;
  for (let i = 0; i < next.length; i++) {
    const code = next.charCodeAt(i);
    // Control characters, space, DEL, and backslash anywhere in the path.
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return null;
  }

  // Belt and braces: resolving against a placeholder origin must stay on
  // that origin, whatever URL-parsing quirk the string above might rely on.
  // What's returned is that parsed URL's percent-encoded form, never the raw
  // input: redirect() copies its target straight into a response header,
  // and a raw non-Latin-1 character (e.g. "/✓") would make that throw.
  let normalized: string;
  try {
    const base = "https://drive.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return null;
    normalized = url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
  // Collapsing dot segments can itself create a "//" prefix ("/.//evil.com"
  // becomes "//evil.com"), so the normalized path is checked again.
  if (!isSameSitePath(normalized) || normalized.length > MAX_NEXT_LENGTH) return null;
  return normalized;
}

function isSameSitePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\");
}
