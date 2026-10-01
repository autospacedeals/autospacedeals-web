// Client-safe checks for the two per-listing option lists a shopper can
// play with in the payment estimator — incentives and mileage tiers. Used
// when reading the hidden JSON fields the broker forms submit, when reading
// rows back from the database, and on AI-parsed deals, so a bad value is
// dropped the same way everywhere.
import type { Incentive, MileageOption } from "./deals-data";

const MAX_INCENTIVES = 20;
const MAX_MILEAGE_OPTIONS = 10;

function money(value: unknown, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return Math.round(n * 100) / 100;
}

// Keeps rows with a name and a positive amount and/or monthly value.
export function sanitizeIncentives(raw: unknown): Incentive[] {
  if (!Array.isArray(raw)) return [];
  const out: Incentive[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
    const amount = money(r.amount, 100000) ?? 0;
    const monthly = money(r.monthly, 5000) ?? 0;
    if (!name || (amount <= 0 && monthly <= 0)) continue;
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

// The hidden-field JSON the broker forms submit, tolerating junk.
export function parseJsonField(formData: FormData, name: string): unknown {
  try {
    return JSON.parse(String(formData.get(name) || "[]"));
  } catch {
    return [];
  }
}
