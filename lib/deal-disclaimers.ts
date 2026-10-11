// A broker's standing extras for new listings, set per make on the broker
// (server-only columns):
//   - deal_disclaimers (0031): disclosure text added to the end of the
//     description, e.g. { "BMW": "* Lease payments shown before…" }
//   - deal_incentive_rules (0032): incentives (and a note at the top of the
//     description) for matching cars, e.g. BMW Loyalty on every BMW except
//     the M3/M4/X5M.
// Applied to each new car of theirs — sheet syncs, uploads, manual adds.
// Rules the seller makes with the listing assistant (lib/listing-assistant.ts)
// live in the same list, carry an id and the instruction they came from, and
// can also narrow by year or sheet tab and set the broker fee, condition or
// delivery.
// SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";
import type { Deal, Incentive, VehicleCondition } from "@/lib/deals-data";

export type DealDisclaimers = Record<string, string>;

export interface RuleFields {
  brokerFee?: number | null;
  condition?: VehicleCondition;
  delivery?: Deal["delivery"];
}

export interface IncentiveRule {
  make: string; // "" = every make
  match?: string; // case-insensitive pattern on "model trim"
  exclude?: string;
  years?: number[];
  tabs?: string[]; // sheet tabs, by name
  incentives: Incentive[];
  // Put at the top of the description: the last matching rule's note wins
  // (a more specific rule restates the general one); every matching rule's
  // text is added.
  note?: string;
  text?: string;
  footer?: string; // added at the end
  set?: RuleFields;
  // Set on rules made with the listing assistant.
  id?: string;
  instruction?: string;
  summary?: string;
  createdAt?: string;
}

// The car a rule is checked against.
export interface RuleCar {
  year?: number | null;
  make: string;
  model: string;
  trim?: string | null;
  sheetTab?: string | null;
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

// Whether a rule covers this car.
export function ruleMatches(r: IncentiveRule, car: RuleCar): boolean {
  if (!r) return false;
  const text = `${car.model} ${car.trim ?? ""}`;
  if (r.make && !sameMake(car.make, r.make)) return false;
  if (r.match && !test(r.match, text)) return false;
  if (test(r.exclude, text)) return false;
  if (r.years?.length && !(car.year && r.years.includes(car.year))) return false;
  if (r.tabs?.length && !(car.sheetTab && r.tabs.some((t) => t.toLowerCase() === car.sheetTab!.toLowerCase()))) {
    return false;
  }
  return true;
}

// The fields the matching rules set (later rules win), as deals columns.
export function ruleColumns(car: RuleCar, extras: DealExtras): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of extras.rules.filter((r) => r?.set && ruleMatches(r, car))) {
    if (r.set!.brokerFee !== undefined) out.broker_fee = r.set!.brokerFee;
    if (r.set!.condition) out.condition = r.set!.condition;
    if (r.set!.delivery !== undefined) out.delivery = r.set!.delivery;
  }
  return out;
}

// The deal's notes and incentives with the broker's extras applied:
// matching rules' incentives replace any with the same name (ignoring the
// make, so "Loyalty Plus" = "BMW Loyalty Plus"), the most specific rule's
// note goes on top, and the make's disclosure (once) at the end.
export function applyDealExtras(
  deal: RuleCar & { notes?: string | null; incentives?: Incentive[] },
  extras: DealExtras
): { notes: string; incentives: Incentive[] } {
  const rules = extras.rules.filter((r) => ruleMatches(r, deal));
  const nameKey = (n: string) => norm(n.replace(new RegExp(deal.make.split(/\W/)[0], "ig"), ""));
  // Programs the rules manage for this make (e.g. loyalty) come only from
  // the rules: any read off the source with a similar name ("Loyalty Plus",
  // "GKL Loyalty") is dropped, so a car the rules leave out gets none.
  // Assistant rules (with an id) only ever add to the cars they cover.
  const managed = [
    ...new Set(
      extras.rules
        .filter((r) => r && !r.id && sameMake(deal.make, r.make))
        .flatMap((r) => (r.incentives ?? []).map((i) => nameKey(i.name)))
    ),
  ].filter(Boolean);
  let incentives = (deal.incentives ?? []).filter((i) => !managed.some((k) => nameKey(i.name).includes(k)));
  let note = "";
  for (const r of rules) {
    const keys = new Set((r.incentives ?? []).map((i) => nameKey(i.name)));
    // A program a rule only marks required or optional (no value) keeps
    // the value the car already has for it.
    const given = (r.incentives ?? []).map((i) => {
      const had = incentives.find((x) => nameKey(x.name) === nameKey(i.name));
      return had && !i.amount && !i.monthly ? { ...had, name: i.name, includedInPrice: i.includedInPrice } : i;
    });
    incentives = [...incentives.filter((i) => !keys.has(nameKey(i.name))), ...given];
    if (r.note) note = r.note;
  }
  // Rule incentives first, in rule order.
  const ruleNames = new Set(rules.flatMap((r) => (r.incentives ?? []).map((i) => nameKey(i.name))));
  incentives.sort((a, b) => Number(!ruleNames.has(nameKey(a.name))) - Number(!ruleNames.has(nameKey(b.name))));

  let notes = (deal.notes ?? "").trim();
  for (const t of rules.map((r) => r.text?.trim()).filter(Boolean).reverse()) {
    if (!notes.includes(t!)) notes = [t, notes].filter(Boolean).join("\n\n");
  }
  if (note && !notes.startsWith(note)) notes = [note, notes].filter(Boolean).join("\n\n");
  for (const f of rules.map((r) => r.footer?.trim()).filter(Boolean)) {
    if (!notes.includes(f!)) notes = [notes, f].filter(Boolean).join("\n\n");
  }
  const key = Object.keys(extras.disclaimers).find((k) => sameMake(deal.make, k));
  const disclaimer = key ? extras.disclaimers[key]?.trim() : "";
  if (disclaimer && !notes.includes(disclaimer.split("\n")[0])) notes = [notes, disclaimer].filter(Boolean).join("\n\n");
  return { notes, incentives };
}
