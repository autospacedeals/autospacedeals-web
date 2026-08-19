// AI-suggested starting points for manufacturer/dealer incentives (loyalty,
// conquest, military, fleet, etc.) on a given vehicle. This is explicitly a
// *suggestion* tool per the broker's own request for AI-assisted incentive
// lookup — Claude doesn't have live access to current OEM incentive
// bulletins, so amounts are ballpark based on typical programs for that
// make, not confirmed current offers. The broker always reviews, edits, or
// removes suggestions before anything is saved to a listing, and the public
// deal page's payment estimator treats every incentive as optional/unverified
// with a clear disclaimer.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

export interface SuggestedIncentive {
  name: string;
  amount: number;
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

export async function suggestIncentives(params: {
  year: number;
  make: string;
  model: string;
  trim?: string;
}): Promise<SuggestedIncentive[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const client = new Anthropic({ apiKey });
  const vehicle = `${params.year} ${params.make} ${params.model}${params.trim ? ` ${params.trim}` : ""}`;

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
      .map((i) => ({ name: i.name.trim(), amount: Math.round(i.amount) }));
  } catch (err) {
    console.error("AI incentive suggestion failed:", err);
    return [];
  }
}
