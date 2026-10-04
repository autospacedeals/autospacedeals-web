// Fills in fuel type and body style for cars coming in from uploads
// (Google Sheets, Excel, pasted text, screenshots), which only carry
// year/make/model/trim. Without these, an uploaded i4 isn't "EV" and an
// uploaded X5 never shows up under the "SUV" filter or quick pick.
//
// One Claude call per upload classifies every distinct vehicle at once. It
// returns null whenever the year/make/model/trim genuinely doesn't settle
// it (e.g. a model sold as both gas and electric with no trim given) — a
// blank field is better than a wrong one, and the broker can still set it
// by hand. If there's no API key or the call fails, a small keyword pass
// catches the unambiguous cases (trims that say "Electric", "Hybrid", …);
// when the model does answer, its answer (including "unknown") is final.
import Anthropic from "@anthropic-ai/sdk";
import type { BodyStyle, FuelType } from "@/lib/deals-data";

const MODEL = "claude-opus-5";

const FUELS: FuelType[] = ["Gas", "Hybrid", "PHEV", "EV"];
const BODIES: BodyStyle[] = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];

export interface VehicleIdentity {
  year: number;
  make: string;
  model: string;
  trim: string | null;
}

export interface VehicleClass {
  fuel: FuelType | null;
  bodyStyle: BodyStyle | null;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_vehicles",
  description: "Record the fuel type and body style of each numbered vehicle.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      vehicles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer", description: "The vehicle's number from the list." },
            fuel: { type: "string", enum: [...FUELS, "unknown"] },
            bodyStyle: { type: "string", enum: [...BODIES, "unknown"] },
          },
          required: ["index", "fuel", "bodyStyle"],
          additionalProperties: false,
        },
      },
    },
    required: ["vehicles"],
    additionalProperties: false,
  },
};

const INSTRUCTIONS = `Classify each US-market vehicle below by fuel type and body style.

Fuel type:
- EV: fully electric (e.g. BMW i4, iX, i5, i7; Porsche Taycan; Mercedes EQE/EQS; Audi e-tron GT/Q4/Q6/Q8 e-tron; Tesla; Hyundai Ioniq 5/6; Kia EV6/EV9; Rivian; Lucid; Polestar; Cadillac Lyriq).
- PHEV: plug-in hybrid (e.g. BMW XM, 2025+ BMW M5, BMW xDrive50e/550e, Porsche E-Hybrid trims, Lamborghini Revuelto/Temerario, Jeep 4xe, Toyota RAV4 Prime, Volvo T8/Recharge plug-ins).
- Hybrid: conventional non-plug-in hybrid (e.g. Toyota/Lexus Hybrid trims, Honda Accord/CR-V Hybrid).
- Gas: gasoline or diesel, including mild hybrids (48V "EQ Boost", MHEV).
- unknown: only when the year/make/model/trim genuinely doesn't determine it — for example a model sold as both gas and electric in that model year with no trim that says which. Don't guess.

Body style: Sedan, SUV (including crossovers and SUV-coupes like the Cayenne Coupe or X6), Truck (pickups), Coupe (two-door cars, convertibles and roadsters; four-door cars marketed as coupes, like BMW Gran Coupes, the BMW i4, Audi Sportbacks or the Mercedes CLS, are Sedan), Minivan, Hatchback (hatchbacks and wagons). Use unknown if none fits or it's unclear.

Return one entry per numbered vehicle.`;

function keyOf(v: VehicleIdentity): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [v.year, norm(v.make), norm(v.model), norm(v.trim)].join("|");
}

// Only the unambiguous words — used when the AI call isn't available.
function keywordFallback(v: VehicleIdentity): VehicleClass {
  const text = ` ${v.model} ${v.trim ?? ""} `.toLowerCase();
  let fuel: FuelType | null = null;
  if (/\b(plug-in|phev|e-hybrid|4xe)\b/.test(text)) fuel = "PHEV";
  else if (/\b(electric|ev)\b/.test(text)) fuel = "EV";
  else if (/\bhybrid\b/.test(text)) fuel = "Hybrid";
  let bodyStyle: BodyStyle | null = null;
  if (/\b(suv|crossover)\b/.test(text)) bodyStyle = "SUV";
  else if (/\bsedan\b/.test(text)) bodyStyle = "Sedan";
  else if (/\b(coupe|convertible|cabriolet|roadster|spyder|spider)\b/.test(text)) bodyStyle = "Coupe";
  else if (/\b(hatchback|wagon)\b/.test(text)) bodyStyle = "Hatchback";
  else if (/\b(pickup|truck)\b/.test(text)) bodyStyle = "Truck";
  return { fuel, bodyStyle };
}

export async function classifyVehicles(vehicles: VehicleIdentity[]): Promise<VehicleClass[]> {
  if (vehicles.length === 0) return [];

  // Classify each distinct car once, however many units are listed.
  const unique: VehicleIdentity[] = [];
  const indexByKey = new Map<string, number>();
  for (const v of vehicles) {
    const key = keyOf(v);
    if (!indexByKey.has(key)) {
      indexByKey.set(key, unique.length);
      unique.push(v);
    }
  }
  const results: VehicleClass[] = unique.map(keywordFallback);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const client = new Anthropic({ apiKey });
      const list = unique
        .map((v, i) => `${i + 1}. ${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ""}`)
        .join("\n");
      const response = await client.messages.create({
        model: MODEL,
        // Enough for a couple hundred distinct cars from a big sheet.
        max_tokens: 12000,
        output_config: { effort: "low" },
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: "tool", name: CLASSIFY_TOOL.name },
        messages: [{ role: "user", content: `${INSTRUCTIONS}\n\n${list}` }],
      });

      if (response.stop_reason !== "refusal") {
        const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        const entries = (block?.input as { vehicles?: { index: number; fuel: unknown; bodyStyle: unknown }[] })
          ?.vehicles;
        for (const e of entries ?? []) {
          const i = e.index - 1;
          if (i < 0 || i >= unique.length) continue;
          const fuel = FUELS.includes(e.fuel as FuelType) ? (e.fuel as FuelType) : null;
          const bodyStyle = BODIES.includes(e.bodyStyle as BodyStyle) ? (e.bodyStyle as BodyStyle) : null;
          results[i] = { fuel, bodyStyle };
        }
      }
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.error(`classifyVehicles: API error ${err.status}:`, err.message);
      } else {
        console.error("classifyVehicles failed:", err);
      }
    }
  }

  return vehicles.map((v) => results[indexByKey.get(keyOf(v))!]);
}
