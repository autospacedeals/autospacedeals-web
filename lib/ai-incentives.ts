// Incentive suggestions for a broker's "Suggest with AI" button. As of this
// version, real data comes first: we query MarketCheck's OEM Incentive
// Search API (lib/marketcheck.ts) for currently-active, named programs on
// the exact vehicle (e.g. "BMW Loyalty Lease Credit", "+$2,500") — the same
// kind of grounded data sites like Autopia show. Claude only gets used as a
// fallback when MarketCheck has no data for that specific year/make/model/
// trim (common for long-tail trims or if MARKETCHECK_API_KEY isn't
// configured yet), and that fallback is still explicitly a ballpark guess,
// clearly tagged as "estimated" rather than "verified" in the returned data
// so the UI can show the difference. The broker always reviews, edits, or
// removes suggestions before anything is saved to a listing, and the public
// deal page's payment estimator treats every incentive as optional/
// unverified with a clear disclaimer regardless of source.
import Anthropic from "@anthropic-ai/sdk";
import { fetchMarketCheckIncentives } from "@/lib/marketcheck";

const MODEL = "claude-haiku-4-5-20251001";

export interface SuggestedIncentive {
  name: string;
  amount: number;
  // "verified" = real, currently-active program pulled from MarketCheck.
  // "estimated" = Claude's ballpark guess, used only when no verified data
  // was found for this vehicle.
  source: "verified" | "estimated";
  // Short eligibility/description text, when available — e.g. a target
  // group ("Military personnel") or the program's own offer text.
  note?: string;
}

const SUGGEST_TOOL = {
  name: "suggest_incentives",
  description: "Return a short list of incentive programs commonly offered on this vehicle.",
  input_schema: {
    type: "object" as const,
    properties: {
      incentives: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: 'Incentive name, e.g. "Loyalty", "Fleet", "Military", "Conquest"',
            },
            amount: { type: "number", description: "Typical/ballpark dollar amount" },
          },
          required: ["name", "amount"],
        },
      },
    },
    required: ["incentives"],
  },
};

async function suggestFromAI(vehicle: string): Promise<SuggestedIncentive[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "suggest_incentives" },
      messages: [
        {
          role: "user",
          content:
            `List up to 5 incentive programs commonly offered by manufacturers or dealers on a ` +
            `${vehicle} lease deal (e.g. loyalty, conquest, military, recent college ` +
            `grad, fleet, lease cash). Give a reasonable ballpark dollar amount for each based on ` +
            `typical programs for this make — these are starting suggestions only, the broker will ` +
            `verify exact current amounts before publishing, so approximate is fine. If you don't ` +
            `have a reasonable sense of typical programs for this make, return an empty list rather ` +
            `than guessing wildly.`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) return [];

    const raw = toolUse.input as { incentives?: { name?: unknown; amount?: unknown }[] };
    if (!Array.isArray(raw.incentives)) return [];

    return raw.incentives
      .filter(
        (i): i is { name: string; amount: number } =>
          typeof i.name === "string" && i.name.trim().length > 0 && typeof i.amount === "number" && i.amount > 0
      )
      .slice(0, 5)
      .map((i) => ({ name: i.name.trim(), amount: Math.round(i.amount), source: "estimated" as const }));
  } catch (err) {
    console.error("AI incentive suggestion failed:", err);
    return [];
  }
}

export async function suggestIncentives(params: {
  year: number;
  make: string;
  model: string;
  trim?: string;
  state?: string;
  zip?: string;
}): Promise<SuggestedIncentive[]> {
  // 1. Real data first. MarketCheck often returns the same effective
  // program multiple times (scraped from several dealer pages, sometimes
  // with different marketing copy attached) — dedupe by name+amount rather
  // than slicing raw results, so a broker doesn't see "Lease Offer $3,750"
  // repeated five times instead of five distinct programs.
  const { offers, error } = await fetchMarketCheckIncentives(params);
  const seen = new Set<string>();
  const verified: SuggestedIncentive[] = [];
  for (const o of offers) {
    if (o.amount === null || o.amount <= 0) continue;
    const name = o.programName;
    const amount = Math.round(o.amount);
    const key = `${name.toLowerCase()}|${amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push({
      name,
      amount,
      source: "verified",
      // Only the structured target-group field (e.g. "Military personnel")
      // is worth surfacing here. `description` is MarketCheck's raw scraped
      // ad copy for the offer ("Well equipped with features such as...") —
      // marketing fluff, not eligibility info, so it doesn't belong next to
      // "Verified current offer."
      note: o.targetGroup || undefined,
    });
    if (verified.length >= 5) break;
  }

  if (verified.length > 0) return verified;

  // Falling through to the AI estimate is silent from the broker's point of
  // view — log why so a Vercel function log can tell "not configured" /
  // "API error" apart from "configured fine, just no coverage for this
  // vehicle" without needing to add a debugger.
  const vehicle = `${params.year} ${params.make} ${params.model}${params.trim ? ` ${params.trim}` : ""}`;
  console.log(
    `MarketCheck: no verified incentives for "${vehicle}" (reason: ${
      error ?? "no matching offers"
    }) — falling back to AI estimate.`
  );

  // 2. Fall back to Claude's ballpark only when MarketCheck has nothing for
  // this exact vehicle.
  return suggestFromAI(vehicle);
}

const ESTIMATE_NAMED_TOOL = {
  name: "estimate_named_incentive",
  description: "Return a ballpark dollar amount for one specific named incentive program on this vehicle.",
  input_schema: {
    type: "object" as const,
    properties: {
      amount: {
        type: ["number", "null"],
        description:
          "Typical dollar amount for this specific named program on this make/model, or null if " +
          "there's no reasonable basis to guess",
      },
    },
    required: ["amount"],
  },
};

async function estimateNamedIncentive(vehicle: string, programName: string): Promise<SuggestedIncentive | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      tools: [ESTIMATE_NAMED_TOOL],
      tool_choice: { type: "tool", name: "estimate_named_incentive" },
      messages: [
        {
          role: "user",
          content:
            `A broker's ad for a ${vehicle} lease states the advertised price requires qualifying ` +
            `for a "${programName}" incentive program, but doesn't give its dollar amount. Give a ` +
            `reasonable ballpark dollar value for a typical "${programName}" program on this ` +
            `make/model — this is a starting estimate the broker will verify before publishing, so ` +
            `approximate is fine. If you don't have a reasonable sense of typical "${programName}" ` +
            `amounts for this make, return null rather than guessing wildly.`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) return null;

    const raw = toolUse.input as { amount?: unknown };
    if (typeof raw.amount !== "number" || raw.amount <= 0) return null;

    return { name: programName, amount: Math.round(raw.amount), source: "estimated" };
  } catch (err) {
    console.error(`Named incentive estimate failed for "${programName}" on ${vehicle}:`, err);
    return null;
  }
}

// Used when a broker's source (screenshot, spreadsheet, pasted text) names a
// SPECIFIC incentive program as a requirement for the advertised price (see
// ParsedDeal.incentiveHints in lib/parse-inventory.ts) but doesn't state its
// dollar value — e.g. "CONQUEST AND FLEET (AAA/SAMS/EMPLOYER required)"
// next to a $899/mo price. Unlike suggestIncentives() above (which surfaces
// generic candidate programs for a vehicle for the broker to pick from),
// this resolves the REAL dollar amount for each specific *named* program:
// MarketCheck first if it has a matching offer, otherwise a targeted Claude
// estimate for that exact program name (not a generic "list some
// incentives" guess). Callers should treat the result as includedInPrice:
// true — the ad's stated price already assumes the shopper qualifies, this
// isn't a stackable extra on top of it.
export async function resolveNamedIncentives(
  params: { year: number; make: string; model: string; trim?: string },
  names: string[]
): Promise<SuggestedIncentive[]> {
  const uniqueNames = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (uniqueNames.length === 0) return [];

  const { offers } = await fetchMarketCheckIncentives(params);
  const vehicle = `${params.year} ${params.make} ${params.model}${params.trim ? ` ${params.trim}` : ""}`;

  const results: SuggestedIncentive[] = [];
  for (const name of uniqueNames) {
    const needle = name.toLowerCase();
    const match = offers.find(
      (o) =>
        o.amount !== null &&
        o.amount > 0 &&
        (o.programName.toLowerCase().includes(needle) ||
          (o.targetGroup && o.targetGroup.toLowerCase().includes(needle)))
    );
    if (match) {
      results.push({
        name: match.programName,
        amount: Math.round(match.amount as number),
        source: "verified",
        note: match.targetGroup || undefined,
      });
      continue;
    }

    const estimate = await estimateNamedIncentive(vehicle, name);
    if (estimate) results.push(estimate);
  }
  return results;
}
