// The ad archive (deal_versions, supabase/migrations/0036_cars_act.sql): a
// copy of each listing every time it was created, changed, taken down or
// deleted — California's CARS Act has dealers keep 2 years of online ads.
// Read with the broker's own session (row-level security: own rows only).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdVersion {
  id: number;
  dealId: string;
  change: string;
  status: string | null;
  recordedAt: string;
  car: string;
  payment: number | null;
  dueAtSigning: number | null;
  term: number | null;
  milesPerYear: number | null;
  totalPrice: number | null;
  msrp: number | null;
  brokerFee: number | null;
  onePay: boolean;
  notes: string;
  otherTerms: string;
  incentives: string;
  slug: string | null;
}

const CHANGE_LABELS: Record<string, string> = {
  baseline: "Archive started",
  created: "Created",
  updated: "Changed",
  published: "Published",
  removed: "Taken down",
  deleted: "Deleted",
};

export function changeLabel(change: string): string {
  return CHANGE_LABELS[change] ?? change;
}

type Snapshot = Record<string, unknown>;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toVersion(row: { id: number; deal_id: string; change: string; status: string | null; recorded_at: string; snapshot: Snapshot }): AdVersion {
  const s = row.snapshot ?? {};
  const car = [s.year, s.make, s.model, s.trim].filter((x) => x != null && String(x).trim()).join(" ");
  const terms = Array.isArray(s.lease_options) ? (s.lease_options as Snapshot[]) : [];
  const incentives = Array.isArray(s.incentives) ? (s.incentives as Snapshot[]) : [];
  return {
    id: row.id,
    dealId: row.deal_id,
    change: row.change,
    status: row.status,
    recordedAt: row.recorded_at,
    car,
    payment: num(s.payment),
    dueAtSigning: num(s.due_at_signing),
    term: num(s.term),
    milesPerYear: num(s.miles_per_year),
    totalPrice: num(s.selling_price),
    msrp: num(s.msrp),
    brokerFee: num(s.broker_fee),
    onePay: s.one_pay === true,
    notes: typeof s.notes === "string" ? s.notes : "",
    otherTerms: terms.map((t) => `${t.term}mo/${t.milesPerYear ?? "?"}mi $${t.payment}`).join("; "),
    incentives: incentives
      .map((i) => `${i.name}${num(i.amount) ? ` $${i.amount}` : ""}${i.includedInPrice ? " (incl.)" : ""}`)
      .join("; "),
    slug: typeof s.slug === "string" ? s.slug : null,
  };
}

const PAGE = 1000;

// Newest first. `limit` caps the rows read (the page shows the latest few
// hundred; the CSV download reads everything).
export async function getAdVersions(supabase: SupabaseClient, brokerId: string, limit = 100000): Promise<AdVersion[]> {
  const out: AdVersion[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await supabase
      .from("deal_versions")
      .select("id, deal_id, change, status, recorded_at, snapshot")
      .eq("broker_id", brokerId)
      .order("recorded_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, Math.min(from + PAGE, limit) - 1);
    if (error) {
      console.error("getAdVersions failed:", error.message);
      break;
    }
    out.push(...(data ?? []).map(toVersion));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function adVersionsCsv(rows: AdVersion[]): string {
  const header = [
    "Recorded (UTC)", "Change", "Status", "Listing ID", "Car", "Monthly payment", "One-pay", "Due at signing",
    "Term (months)", "Miles per year", "Total price", "MSRP", "Broker fee", "Other terms", "Incentives", "Description",
  ];
  const lines = rows.map((r) =>
    [
      r.recordedAt, changeLabel(r.change), r.status, r.dealId, r.car, r.payment, r.onePay ? "yes" : "", r.dueAtSigning,
      r.term, r.milesPerYear, r.totalPrice, r.msrp, r.brokerFee, r.otherTerms, r.incentives, r.notes,
    ].map(csvCell).join(",")
  );
  return [header.join(","), ...lines].join("\r\n");
}
