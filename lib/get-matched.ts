// Client-safe limits and checks shared by the "Get matched with similar
// deals" dialog (components/GetMatched.tsx) and its server action
// (app/deals/[slug]/actions.ts) — a "use server" file can only export async
// functions, so these live here.

// The similar deals a deal page shows (it shows 3), with a little headroom:
// a hard cap on how many ids one request can make the server look up.
export const MAX_SIMILAR_IDS = 6;

export const EMAIL_MAX = 254;

// A deliberately plain check: something@domain.tld, with no spaces or
// characters that could break an address header. Resend does the rest.
const EMAIL_RE =
  /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmailAddress(value: string): boolean {
  return value.length <= EMAIL_MAX && EMAIL_RE.test(value);
}

export const INVALID_EMAIL_MESSAGE = "Enter a valid email address, like name@example.com.";
export const MISSING_EMAIL_MESSAGE = "Enter your email address.";
