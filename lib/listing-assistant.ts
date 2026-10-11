// The listing assistant on the seller dashboard. A seller types what they
// want changed ("Loyalty is required on all the BMWs", "my fee is $595 on
// every Hyundai", "take down the 2025s"), and the AI turns it into one
// change: a standing rule (lib/deal-disclaimers.ts — applied to their cars
// now and to every car they add or sync later), a one-time removal, or
// deleting a rule. The AI only translates the message; which cars match and
// what changes is worked out here, shown to the seller, and applied only
// when they confirm (app/broker/dashboard/assistant-actions.ts).
//
// Each message is one small AI call (the seller's inventory as a list of
// distinct cars, not the listings themselves).
// SERVER-ONLY.
import Anthropic from "@anthropic-ai/sdk";
import type { Deal, Incentive, VehicleCondition } from "@/lib/deals-data";
import { formatCurrency } from "@/lib/deal-utils";
import { applyDealExtras, ruleMatches, type DealExtras, type IncentiveRule, type RuleFields } from "@/lib/deal-disclaimers";

const MODEL = "claude-sonnet-5-5";

// Messages a seller can send a day.
export const DAILY_MESSAGE_LIMIT = 40;
export const MESSAGE_MAX = 1000;

// A seller's listing, as far as the assistant needs it.
export interface AssistantListing {
  id: string;
  status: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  sheet_tab: string | null;
  notes: string | null;
  incentives: Incentive[] | null;
  broker_fee: number | null;
  condition: VehicleCondition | null;
  delivery: Deal["delivery"];
}

export const ASSISTANT_LISTING_COLUMNS =
  "id, status, year, make, model, trim, sheet_tab, notes, incentives, broker_fee, condition, delivery";

export interface CarFilter {
  make: string;
  match?: string;
  exclude?: string;
  years?: number[];
  tabs?: string[];
}

export type AssistantPlan =
  | { kind: "rule"; summary: string; rule: IncentiveRule }
  | { kind: "remove"; summary: string; filter: CarFilter }
  | { kind: "delete_rule"; summary: string; ruleId: string };

export interface AssistantPreview {
  count: number;
  // "2026 BMW X5 xDrive40i ×3", the first few dozen.
  cars: string[];
  moreCars: number;
  // What happens to each of them / going forward.
  changes: string[];
}

const CONDITIONS: VehicleCondition[] = ["New", "Loaner", "Demo", "CPO", "Used"];
const DELIVERY = ["pickup", "in_state", "nationwide"] as const;

const PLAN_TOOL = {
  name: "plan_listing_change",
  description: "Turn the seller's message into one change to their listings, or just reply.",
  input_schema: {
    type: "object" as const,
    properties: {
      reply: {
        type: "string",
        description:
          "Short, plain message back to the seller (1-3 sentences): what this change will do, or a question if " +
          "the message is unclear, or why it can't be done here.",
      },
      action: {
        type: "string",
        enum: ["rule", "remove_listings", "delete_rule", "none"],
        description:
          "rule: a standing rule for matching cars (programs, notes, fee, condition, delivery). remove_listings: " +
          "take matching cars down now. delete_rule: delete one of their existing rules. none: just reply.",
      },
      summary: {
        type: "string",
        description: 'One short line naming the change, e.g. "Loyalty required on all BMWs except the M3".',
      },
      cars: {
        type: "object",
        description: "Which cars (rule or remove_listings). Leave a field out to not filter on it.",
        properties: {
          make: { type: "string", description: 'Exact make from their inventory, or "" for every make.' },
          match: {
            type: "string",
            description:
              'Case-insensitive JavaScript regex tested against "model trim", e.g. "^X5\\\\b" or "\\\\bM3\\\\b|\\\\bM4\\\\b". ' +
              "Leave out to match every model of the make.",
          },
          exclude: { type: "string", description: 'Regex on "model trim" for cars to leave out.' },
          years: { type: "array", items: { type: "integer" } },
          tabs: { type: "array", items: { type: "string" }, description: "Sheet tab names, exactly as listed." },
        },
      },
      programs: {
        type: "array",
        description:
          "Incentive programs (Loyalty, Conquest, Military, College Grad...) for the rule. Only what the seller said.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: 'Program name, e.g. "BMW Loyalty"' },
            required: {
              type: "boolean",
              description:
                "true: the advertised price already assumes it (the shopper must qualify). false: optional, " +
                "lowers the price for shoppers who qualify (needs an amount or monthly).",
            },
            amount: { type: "number", description: "Dollar value, only if the seller stated it." },
            monthly: { type: "number", description: "How much it changes the monthly payment, only if stated." },
          },
          required: ["name", "required"],
        },
      },
      note_top: { type: "string", description: "A line to add to the top of each matching listing's description." },
      note_bottom: { type: "string", description: "A disclaimer/line to add to the end of the description." },
      broker_fee: { type: "number", description: "Set the broker fee (dollars; 0 for no fee)." },
      condition: { type: "string", enum: CONDITIONS },
      delivery: {
        type: "string",
        enum: [...DELIVERY],
        description: "pickup: local pickup only; in_state: delivers in their state; nationwide: delivers anywhere.",
      },
      rule_id: { type: "string", description: "For delete_rule: the id of the rule, from their list." },
    },
    required: ["reply", "action"],
  },
};

const SYSTEM = `You help car-lease sellers (brokers and dealership salespeople) on Drive, a lease-deal marketplace, update their listings by typing what they want. You turn each message into exactly one change, which the seller previews before it's applied.

What you can do:
- action "rule": a standing rule for a set of their cars. It's applied to the matching cars they have now AND to every matching car they add or that comes in from their Google Sheet later. A rule can: add incentive programs (required = the price already assumes it; optional = lowers the price if the shopper qualifies), add a line to the top or end of the description, set the broker fee, set the condition (New, Loaner, Demo, CPO, Used), or set delivery (pickup, in_state, nationwide).
- action "remove_listings": take matching cars down now (the seller can restore them from "Removed").
- action "delete_rule": delete one of their existing rules (by id).
- action "none": just reply — for questions, unclear messages, or anything you can't do.

You can't change payments, due at signing, MSRP, terms, mileage, photos or trims — tell them to edit the listing or update their sheet. Never invent dollar amounts or programs the seller didn't state. If a request is ambiguous (which cars? required or optional?), ask instead of guessing. One change per message: if they ask for several, do the first and tell them to send the rest next.

Picking cars: use the exact make names from their inventory below; "" for every make. "match"/"exclude" are case-insensitive regexes on "model trim" (e.g. model "X5", trim "xDrive40i" is tested as "X5 xDrive40i"); use word boundaries so "X5" doesn't match "X5 M" unless meant. Use years or tabs only when they name a year or a sheet tab ("in the sheet" means all their cars). Check your filter against their inventory list.

Always answer by calling plan_listing_change, exactly once, even for questions. Keep replies short and plain, no markdown. Say what will change; don't give a number of cars (the seller sees the exact list next to your reply).`;

// The seller's cars as distinct lines, with counts, plus their rules.
export function inventorySummary(listings: AssistantListing[], extras: DealExtras): string {
  const counts = new Map<string, number>();
  const tabs = new Set<string>();
  for (const l of listings) {
    const line = [l.year, l.make, l.model, l.trim].filter(Boolean).join(" ") + (l.sheet_tab ? ` [tab: ${l.sheet_tab}]` : "");
    counts.set(line, (counts.get(line) ?? 0) + 1);
    if (l.sheet_tab) tabs.add(l.sheet_tab);
  }
  const cars = [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([line, n]) => (n > 1 ? `${line} ×${n}` : line));
  const rules = extras.rules.map((r) => `- id ${r.id ?? "?"}: ${describeRule(r)}`);
  const disclaimers = Object.keys(extras.disclaimers).map((make) => `- A disclaimer at the end of every ${make} listing (set by Drive)`);
  return [
    `Their listings (${listings.length}):`,
    ...(cars.length ? cars : ["(none)"]),
    tabs.size ? `Sheet tabs: ${[...tabs].join(", ")}` : "",
    "",
    "Their rules:",
    ...(rules.length || disclaimers.length ? [...rules, ...disclaimers] : ["(none)"]),
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function carsPhrase(f: { make: string; match?: string; exclude?: string; years?: number[]; tabs?: string[] }): string {
  const parts = [f.years?.length ? f.years.join("/") : "", f.make || "all", f.match ? `matching "${f.match}"` : "", "cars"];
  let s = parts.filter(Boolean).join(" ").replace(/ +/g, " ");
  if (f.exclude) s += ` except "${f.exclude}"`;
  if (f.tabs?.length) s += ` on the ${f.tabs.join(", ")} tab${f.tabs.length > 1 ? "s" : ""}`;
  return s;
}

function programPhrase(i: Incentive): string {
  if (i.includedInPrice) return `${i.name} required${i.amount ? ` (${formatCurrency(i.amount)})` : ""}`;
  const value = [i.amount ? formatCurrency(i.amount) : "", i.monthly ? `${formatCurrency(i.monthly)}/mo` : ""].filter(Boolean);
  return `${i.name} optional (${value.join(", ")} off)`;
}

const DELIVERY_LABEL: Record<string, string> = {
  pickup: "local pickup only",
  in_state: "delivers in state",
  nationwide: "delivers nationwide",
};

// What a rule does, in words.
export function ruleChanges(r: IncentiveRule): string[] {
  const out: string[] = [];
  for (const i of r.incentives ?? []) out.push(programPhrase(i));
  if (r.note) out.push(`Top of description: "${r.note}"`);
  if (r.text) out.push(`Top of description: "${r.text}"`);
  if (r.footer) out.push(`End of description: "${r.footer}"`);
  if (r.set?.brokerFee !== undefined) out.push(r.set.brokerFee ? `Broker fee ${formatCurrency(r.set.brokerFee)}` : "No broker fee");
  if (r.set?.condition) out.push(`Condition: ${r.set.condition}`);
  if (r.set?.delivery) out.push(`Delivery: ${DELIVERY_LABEL[r.set.delivery] ?? r.set.delivery}`);
  return out;
}

export function describeRule(r: IncentiveRule): string {
  return r.summary ?? `${carsPhrase(r)}: ${ruleChanges(r).join("; ")}`;
}

function validRegex(p: unknown): string | undefined {
  if (typeof p !== "string" || !p.trim()) return undefined;
  try {
    new RegExp(p, "i");
    return p.trim().slice(0, 300);
  } catch {
    return undefined;
  }
}

function money(n: unknown, max: number): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : undefined;
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

function parseFilter(raw: unknown, makes: string[]): CarFilter | null {
  const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const makeIn = clean(f.make, 60);
  // Only makes they actually have (any spelling), or every make.
  const make = makeIn ? makes.find((m) => m.toLowerCase() === makeIn.toLowerCase()) ?? makeIn : "";
  const years = Array.isArray(f.years) ? f.years.filter((y): y is number => Number.isInteger(y) && y > 1990 && y < 2100) : [];
  const tabs = Array.isArray(f.tabs) ? f.tabs.map((t) => clean(t, 100)).filter(Boolean) : [];
  return {
    make,
    ...(validRegex(f.match) ? { match: validRegex(f.match) } : {}),
    ...(validRegex(f.exclude) ? { exclude: validRegex(f.exclude) } : {}),
    ...(years.length ? { years } : {}),
    ...(tabs.length ? { tabs } : {}),
  };
}

// The AI's answer, checked; anything malformed becomes a plain reply.
export function parsePlan(
  raw: Record<string, unknown>,
  ctx: { makes: string[]; ruleIds: string[] }
): { reply: string; plan: AssistantPlan | null } {
  const reply = clean(raw.reply, 1000) || "Sorry, I couldn't work that out. Try saying it another way.";
  const summary = clean(raw.summary, 200);
  const action = raw.action;

  if (action === "delete_rule") {
    const ruleId = clean(raw.rule_id, 80);
    if (!ctx.ruleIds.includes(ruleId)) return { reply, plan: null };
    return { reply, plan: { kind: "delete_rule", summary: summary || "Delete a rule", ruleId } };
  }

  if (action === "remove_listings") {
    const filter = parseFilter(raw.cars, ctx.makes);
    if (!filter) return { reply, plan: null };
    return { reply, plan: { kind: "remove", summary: summary || `Take down ${carsPhrase(filter)}`, filter } };
  }

  if (action === "rule") {
    const filter = parseFilter(raw.cars, ctx.makes);
    if (!filter) return { reply, plan: null };
    const incentives: Incentive[] = [];
    for (const p of Array.isArray(raw.programs) ? raw.programs : []) {
      const r = (p ?? {}) as Record<string, unknown>;
      const name = clean(r.name, 80);
      const amount = money(r.amount, 100000) ?? 0;
      const monthly = money(r.monthly, 5000) ?? 0;
      const required = r.required === true;
      // An optional program needs a value, or there's nothing to show.
      if (!name || (!required && !amount && !monthly)) continue;
      incentives.push({ name, amount, includedInPrice: required, ...(monthly ? { monthly } : {}) });
    }
    const set: RuleFields = {};
    const fee = money(raw.broker_fee, 20000);
    if (fee !== undefined) set.brokerFee = fee;
    if (CONDITIONS.includes(raw.condition as VehicleCondition)) set.condition = raw.condition as VehicleCondition;
    if (DELIVERY.includes(raw.delivery as (typeof DELIVERY)[number])) set.delivery = raw.delivery as Deal["delivery"];
    const text = clean(raw.note_top, 500);
    const footer = clean(raw.note_bottom, 1500);
    const rule: IncentiveRule = {
      ...filter,
      incentives,
      ...(text ? { text } : {}),
      ...(footer ? { footer } : {}),
      ...(Object.keys(set).length ? { set } : {}),
    };
    if (ruleChanges(rule).length === 0) return { reply, plan: null };
    return { reply, plan: { kind: "rule", summary: summary || describeRule(rule), rule } };
  }

  return { reply, plan: null };
}

export async function askAssistant(input: {
  message: string;
  history: { message: string; reply: string; status: string }[];
  listings: AssistantListing[];
  extras: DealExtras;
}): Promise<{ reply: string; plan: AssistantPlan | null; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic();
  // Earlier messages as context in the one turn (as real turns, the model
  // starts answering in plain text instead of calling the tool).
  const earlier = input.history.map(
    (h) => `Seller: ${h.message}\nYou: ${h.reply}${h.status !== "reply" ? ` (change ${h.status})` : ""}`
  );
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: earlier.length
        ? `Earlier in this conversation:\n${earlier.join("\n\n")}\n\nThe seller's new message:\n${input.message}`
        : input.message,
    },
  ];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      { type: "text", text: SYSTEM },
      // Cached: a seller's follow-up messages reuse it at a tenth of the cost.
      { type: "text", text: inventorySummary(input.listings, input.extras), cache_control: { type: "ephemeral" } },
    ],
    tools: [PLAN_TOOL],
    // This model can't be made to call a tool; the prompt asks it to, and
    // a plain-text answer is used as the reply.
    tool_choice: { type: "auto" },
    // A quick translation, not a reasoned answer ("between_tools" is this
    // model's way of turning thinking off).
    thinking: { type: "between_tools" },
    messages,
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);

  const tool = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const makes = [...new Set(input.listings.map((l) => l.make))];
  const ruleIds = input.extras.rules.map((r) => r.id).filter((id): id is string => Boolean(id));
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const raw = (tool?.input ?? { action: "none", reply: text }) as Record<string, unknown>;
  // A tab only when the seller names one (the model adds the make's tab on
  // its own, which would leave out the make's cars on other tabs later).
  const cars = raw.cars as Record<string, unknown> | undefined;
  if (cars?.tabs && !/\btabs?\b/i.test(input.message)) delete cars.tabs;
  const { reply, plan } = parsePlan(raw, { makes, ruleIds });
  const u = response.usage;
  // Cached and uncached input together (the cache only changes the price).
  const inputTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  return { reply, plan, inputTokens, outputTokens: u.output_tokens };
}

// The listings a plan touches: matching active cars for a rule or removal,
// the cars a deleted rule covered.
export function planTargets(plan: AssistantPlan, listings: AssistantListing[], extras: DealExtras): AssistantListing[] {
  const active = listings.filter((l) => l.status === "draft" || l.status === "published");
  const car = (l: AssistantListing) => ({ year: l.year, make: l.make, model: l.model, trim: l.trim, sheetTab: l.sheet_tab });
  if (plan.kind === "rule") return active.filter((l) => ruleMatches(plan.rule, car(l)));
  if (plan.kind === "remove") return active.filter((l) => ruleMatches({ ...plan.filter, incentives: [] }, car(l)));
  const rule = extras.rules.find((r) => r.id === plan.ruleId);
  return rule ? active.filter((l) => ruleMatches(rule, car(l))) : [];
}

export function buildPreview(plan: AssistantPlan, targets: AssistantListing[], extras: DealExtras): AssistantPreview {
  const counts = new Map<string, number>();
  for (const l of targets) {
    const line = [l.year, l.make, l.model, l.trim].filter(Boolean).join(" ");
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const lines = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([l, n]) => (n > 1 ? `${l} ×${n}` : l));
  const MAX = 40;
  let changes: string[];
  if (plan.kind === "rule") {
    changes = [...ruleChanges(plan.rule), "Also applied to matching cars you add or sync later"];
  } else if (plan.kind === "remove") {
    changes = ["Taken down now (you can restore them from Removed)"];
  } else {
    const rule = extras.rules.find((r) => r.id === plan.ruleId);
    changes = [
      `Deletes the rule: ${rule ? describeRule(rule) : "?"}`,
      "Its programs and description lines come off these cars; a fee, condition or delivery it set stays as is",
    ];
  }
  return { count: targets.length, cars: lines.slice(0, MAX), moreCars: Math.max(0, lines.length - MAX), changes };
}

// The fields a plan may change on a listing, for Undo.
export type ListingSnapshot = Pick<AssistantListing, "id" | "status" | "notes" | "incentives" | "broker_fee" | "condition" | "delivery">;

export function snapshotOf(l: AssistantListing): ListingSnapshot {
  return {
    id: l.id,
    status: l.status,
    notes: l.notes,
    incentives: l.incentives,
    broker_fee: l.broker_fee,
    condition: l.condition,
    delivery: l.delivery,
  };
}

// A rule applied to one listing: its programs and lines added, its fields set.
export function ruleUpdate(rule: IncentiveRule, l: AssistantListing): Record<string, unknown> {
  const { notes, incentives } = applyDealExtras(
    { year: l.year, make: l.make, model: l.model, trim: l.trim, sheetTab: l.sheet_tab, notes: l.notes, incentives: l.incentives ?? [] },
    { disclaimers: {}, rules: [rule] }
  );
  return {
    notes,
    incentives,
    ...(rule.set?.brokerFee !== undefined ? { broker_fee: rule.set.brokerFee } : {}),
    ...(rule.set?.condition ? { condition: rule.set.condition } : {}),
    ...(rule.set?.delivery !== undefined ? { delivery: rule.set.delivery } : {}),
  };
}

// A deleted rule taken off one listing: its programs (unless another rule
// still gives them) and its description lines.
export function ruleRemoval(rule: IncentiveRule, others: IncentiveRule[], l: AssistantListing): Record<string, unknown> {
  const car = { year: l.year, make: l.make, model: l.model, trim: l.trim, sheetTab: l.sheet_tab };
  const stillGiven = new Set(
    others.filter((r) => ruleMatches(r, car)).flatMap((r) => (r.incentives ?? []).map((i) => i.name.toLowerCase()))
  );
  const names = new Set((rule.incentives ?? []).map((i) => i.name.toLowerCase()).filter((n) => !stillGiven.has(n)));
  let notes = l.notes ?? "";
  for (const line of [rule.text, rule.note, rule.footer]) {
    if (line?.trim()) notes = notes.split(line.trim()).join("");
  }
  notes = notes.replace(/\n{3,}/g, "\n\n").trim();
  return { notes, incentives: (l.incentives ?? []).filter((i) => !names.has(i.name.toLowerCase())) };
}
