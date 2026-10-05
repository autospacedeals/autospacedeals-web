// A broker's standing extras for new listings, set per make on the broker
// (server-only columns):
//   - deal_disclaimers (0031): disclosure text added to the end of the
//     description, e.g. { "BMW": "* Lease payments shown before…" }
//   - deal_incentive_rules (0032): incentives (and a note at the top of the
//     description) for matching cars, e.g. BMW Loyalty on every BMW except
//     the M3/M4/X5M.
// Applied to each new car of theirs — sheet syncs, uploads, manual adds.
// SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";
import type { Incentive } from "@/lib/deals-data";

export type DealDisclaimers = Record<string, string>;

export interface IncentiveRule {
  make: string;
  match?: string; // case-insensitive pattern on "model trim"
  exclude?: string;
  incentives: Incentive[];
  note?: string; // put at the top of the description
}

export interface DealExtras {
  disclaimers: DealDisclaimers;
  rules: IncentiveRule[];
}

export async function getDealExtras(brokerId: string): Promise<DealExtras> {
  try {
    const { data, error } = await createAdminClient()
      .from("brokers")
      .select("deal_disclaimers, deal_incentive_rules")
      .eq("id", brokerId)
      .maybeSingle<{ deal_disclaimers: DealDisclaimers | null; deal_incentive_rules: IncentiveRule[] | null }>();
    if (error) {
      console.error("getDealExtras failed:", error.message);
      return { disclaimers: {}, rules: [] };
    }
    return {
      disclaimers: data?.deal_disclaimers ?? {},
      rules: Array.isArray(data?.deal_incentive_rules) ? data!.deal_incentive_rules! : [],
    };
  } catch (err) {
    console.error("getDealExtras threw:", err);
    return { disclaimers: {}, rules: [] };
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
// Makes match loosely ("Mercedes" / "Mercedes-Benz").
const sameMake = (a: string, b: string) => norm(a).startsWith(norm(b)) || norm(b).startsWith(norm(a));

function test(pattern: string | undefined, text: string): boolean {
  if (!pattern) return false;
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return false;
  }
}

// The deal's notes and incentives with the broker's extras applied:
// matching rules' incentives replace any with the same name (ignoring the
// make, so "Loyalty Plus" = "BMW Loyalty Plus"), the most specific rule's
// note goes on top, and the make's disclosure (once) at the end.
export function applyDealExtras(
  deal: { make: string; model: string; trim?: string | null; notes?: string | null; incentives?: Incentive[] },
  extras: DealExtras
): { notes: string; incentives: Incentive[] } {
  const text = `${deal.model} ${deal.trim ?? ""}`;
  const rules = extras.rules.filter(
    (r) => r && sameMake(deal.make, r.make) && (!r.match || test(r.match, text)) && !test(r.exclude, text)
  );
  const nameKey = (n: string) => norm(n.replace(new RegExp(deal.make.split(/\W/)[0], "ig"), ""));
  // Programs the rules manage for this make (e.g. loyalty) come only from
  // the rules: any read off the source with a similar name ("Loyalty Plus",
  // "GKL Loyalty") is dropped, so a car the rules leave out gets none.
  const managed = [
    ...new Set(
      extras.rules.filter((r) => r && sameMake(deal.make, r.make)).flatMap((r) => (r.incentives ?? []).map((i) => nameKey(i.name)))
    ),
  ].filter(Boolean);
  let incentives = (deal.incentives ?? []).filter((i) => !managed.some((k) => nameKey(i.name).includes(k)));
  let note = "";
  for (const r of rules) {
    const keys = new Set((r.incentives ?? []).map((i) => nameKey(i.name)));
    incentives = [...incentives.filter((i) => !keys.has(nameKey(i.name))), ...(r.incentives ?? [])];
    if (r.note) note = r.note;
  }
  // Rule incentives first, in rule order.
  const ruleNames = new Set(rules.flatMap((r) => (r.incentives ?? []).map((i) => nameKey(i.name))));
  incentives.sort((a, b) => Number(!ruleNames.has(nameKey(a.name))) - Number(!ruleNames.has(nameKey(b.name))));

  let notes = (deal.notes ?? "").trim();
  if (note && !notes.startsWith(note)) notes = [note, notes].filter(Boolean).join("\n\n");
  const key = Object.keys(extras.disclaimers).find((k) => sameMake(deal.make, k));
  const disclaimer = key ? extras.disclaimers[key]?.trim() : "";
  if (disclaimer && !notes.includes(disclaimer.split("\n")[0])) notes = [notes, disclaimer].filter(Boolean).join("\n\n");
  return { notes, incentives };
}
