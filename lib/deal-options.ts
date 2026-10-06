// Client-safe checks for the per-listing option lists a shopper can play
// with in the payment estimator — incentives, mileage tiers and other lease
// terms. Used
// when reading the hidden JSON fields the broker forms submit, when reading
// rows back from the database, and on AI-parsed deals, so a bad value is
// dropped the same way everywhere.
import type { Incentive, LeaseOption, MileageOption } from "./deals-data";

const MAX_INCENTIVES = 20;
const MAX_MILEAGE_OPTIONS = 10;
const MAX_LEASE_OPTIONS = 24;

function money(value: unknown, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return Math.round(n * 100) / 100;
}

// A program the advertised price assumes, with no stated value ("with
// MyFirstEV") — the shopper has to qualify for it. Shown as a requirement,
// not as a toggle in the payment estimator.
export function isRequiredProgram(inc: Incentive): boolean {
  return inc.includedInPrice === true && !(inc.amount > 0) && !(inc.monthly && inc.monthly > 0);
}

// Keeps rows with a name and a positive amount and/or monthly value, plus
// required programs (included in the price, value not stated).
export function sanitizeIncentives(raw: unknown): Incentive[] {
  if (!Array.isArray(raw)) return [];
  const out: Incentive[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
    const amount = money(r.amount, 100000) ?? 0;
    const monthly = money(r.monthly, 5000) ?? 0;
    if (!name || (amount <= 0 && monthly <= 0 && r.includedInPrice !== true)) continue;
    out.push({
      name,
      amount: Math.max(0, amount),
      includedInPrice: r.includedInPrice === true,
      ...(monthly > 0 ? { monthly } : {}),
    });
    if (out.length >= MAX_INCENTIVES) break;
  }
  return out;
}

// Whole miles between 1,000 and 50,000 a year, one row per mileage, sorted,
// without the advertised mileage itself.
export function sanitizeMileageOptions(raw: unknown, advertisedMiles?: number | null): MileageOption[] {
  if (!Array.isArray(raw)) return [];
  const byMiles = new Map<number, number>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const milesRaw = typeof r.milesPerYear === "number" ? r.milesPerYear : Number(r.milesPerYear);
    const miles = Math.round(milesRaw);
    const delta = money(r.monthlyDelta, 2000);
    if (!Number.isFinite(miles) || miles < 1000 || miles > 50000 || delta == null) continue;
    if (advertisedMiles && miles === advertisedMiles) continue;
    if (!byMiles.has(miles)) byMiles.set(miles, delta);
  }
  return [...byMiles.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_MILEAGE_OPTIONS)
    .map(([milesPerYear, monthlyDelta]) => ({ milesPerYear, monthlyDelta }));
}

// Other lease terms: whole-month terms 6–84, miles 1,000–50,000 (or none),
// a positive payment; one row per term + mileage, without the headline
// term/mileage itself, sorted by term then mileage.
export function sanitizeLeaseOptions(
  raw: unknown,
  headline?: { term?: number | null; milesPerYear?: number | null }
): LeaseOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Map<string, LeaseOption>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const term = Math.round(Number(r.term));
    const milesRaw = r.milesPerYear == null || r.milesPerYear === "" ? null : Math.round(Number(r.milesPerYear));
    const payment = money(r.payment, 50000);
    if (!Number.isFinite(term) || term < 6 || term > 84) continue;
    if (milesRaw != null && (!Number.isFinite(milesRaw) || milesRaw < 1000 || milesRaw > 50000)) continue;
    if (payment == null || payment <= 0) continue;
    if (headline?.term === term && (headline.milesPerYear ?? null) === milesRaw) continue;
    const key = `${term}|${milesRaw ?? ""}`;
    if (!seen.has(key)) seen.set(key, { term, milesPerYear: milesRaw, payment });
  }
  return [...seen.values()]
    .sort((a, b) => a.term - b.term || (a.milesPerYear ?? 0) - (b.milesPerYear ?? 0))
    .slice(0, MAX_LEASE_OPTIONS);
}

// The hidden-field JSON the broker forms submit, tolerating junk.
export function parseJsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(String(formData.get(name) || "[]"));
  } catch {
    return [];
  }
}
