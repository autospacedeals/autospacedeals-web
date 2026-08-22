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
  // 1. Real data first.
  const { offers, error } = await fetchMarketCheckIncentives(params);
  const verified: SuggestedIncentive[] = offers
    .filter((o) => o.amount !== null && o.amount > 0)
    .slice(0, 5)
    .map((o) => ({
      name: o.programName,
      amount: Math.round(o.amount as number),
      source: "verified" as const,
      note: o.targetGroup || o.description || undefined,
    }));

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
