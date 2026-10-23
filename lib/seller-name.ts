// The name a seller trades under, for listings and messages:
// "OC AUTO LEASE DBA COASTAL MOTOR GROUP" -> "Coastal Motor Group". Used on
// every public page, their profile included; only the admin pages (and the
// profile's structured data, as legalName) show the registered name.
export function tradeName(name: string): string;
export function tradeName(name: string | null): string | null;
export function tradeName(name: string | null): string | null {
  if (!name) return name;
  const parts = name.split(/\s+d[./]?\s?b[./]?\s?a\.?\s+/i);
  const dba = parts[parts.length - 1].trim();
  if (parts.length < 2 || !dba) return name;
  // An all-caps trade name reads as shouting in a listing; short words
  // (LLC, OC, USA) stay as they are.
  if (dba !== dba.toUpperCase()) return dba;
  return dba.replace(/[A-Z][A-Z'&-]*/g, (w) => (w.length <= 3 ? w : w.charAt(0) + w.slice(1).toLowerCase()));
}
