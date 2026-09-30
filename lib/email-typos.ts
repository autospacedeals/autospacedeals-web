// Catches mistyped email domains at signup ("name@gmai.com") — otherwise
// the confirmation email goes to a domain that doesn't exist and the
// person just never hears back. Suggests the provider they almost
// certainly meant; used by the signup forms (a "Did you mean…?" hint) and
// their server actions (which refuse the obvious typos).

const COMMON_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "comcast.net",
  "sbcglobal.net",
  "att.net",
  "verizon.net",
  "protonmail.com",
];

// Real providers that happen to look like a typo of one above.
const REAL_LOOKALIKES = new Set([
  "ymail.com",
  "email.com",
  "mail.com",
  "gmx.com",
  "me.com",
  "mac.com",
  "live.com",
  "msn.com",
  "aim.com",
  "proton.me",
  "pm.me",
  "hotmail.co.uk",
  "yahoo.co.uk",
  "outlook.co.uk",
  "googlemail.com",
]);

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        // Swapped neighbours ("gmial") count as one slip.
        i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? dp[i - 2][j - 2] + 1 : Infinity
      );
    }
  }
  return dp[a.length][b.length];
}

/** The corrected address if the domain looks like a slip, else null. */
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain) || REAL_LOOKALIKES.has(domain)) return null;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of COMMON_DOMAINS) {
    const d = distance(domain, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  // One slip for any domain, two for longer ones ("hotmial.con").
  const allowed = domain.length >= 9 ? 2 : 1;
  return best && bestDistance <= allowed ? `${local}@${best}` : null;
}
