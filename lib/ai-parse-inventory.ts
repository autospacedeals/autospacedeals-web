// AI-powered deal extraction — from a spreadsheet, from a broker just
// typing up what they've got, or from a screenshot. Brokers format their
// inventory wildly differently (different columns, combined cells,
// shorthand, typos, or no structure at all), which a hand-written parser
// can never fully keep up with, so when an API key is configured this is
// tried first; the heuristic parser in parse-inventory.ts is only a
// fallback for the spreadsheet case (missing key, API error, etc — there's
// no heuristic equivalent for free text or images).
//
// This never publishes anything directly: every row it extracts becomes a
// "draft" deal the broker still has to review and confirm, so a wrong
// guess here just means unchecking a box (or fixing a field), not a bad
// listing going live.
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { ParsedDeal, ParseResult } from "./parse-inventory";

const MODEL = "claude-haiku-4-5-20251001";

const EXTRACT_TOOL = {
  name: "extract_deals",
  description: "Return every distinct vehicle listing found.",
  input_schema: {
    type: "object" as const,
    properties: {
      deals: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            year: { type: "number", description: "4-digit model year" },
            make: { type: "string", description: "Manufacturer, e.g. Porsche" },
            model: { type: "string", description: "Model name, e.g. Taycan" },
            trim: { type: ["string", "null"], description: "Trim/spec if mentioned, else null" },
            msrp: { type: ["number", "null"], description: "MSRP in dollars, e.g. 217000 for \"217k\"" },
            payment: { type: ["number", "null"], description: "Monthly payment in dollars" },
            term: { type: ["number", "null"], description: "Lease term in months" },
            milesPerYear: { type: ["number", "null"], description: "Mileage allowance per year" },
            dueAtSigning: { type: ["number", "null"], description: "Due at signing / drive-off in dollars" },
            exterior: { type: ["string", "null"], description: "Exterior color" },
            interior: { type: ["string", "null"], description: "Interior color" },
            state: {
              type: ["string", "null"],
              description: "2-letter US state code, inferred from any region/city mentioned (e.g. \"Socal\" -> CA)",
            },
            notes: {
              type: "string",
              description:
                "Anything else worth keeping — condition (CPO/loaner/demo), broker fee, or other details that didn't fit a field above. Empty string if nothing.",
            },
          },
          required: ["year", "make", "model", "notes"],
        },
      },
    },
    required: ["deals"],
  },
};

function rowsToTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(" | ")];
  for (const row of rows) {
    lines.push(headers.map((h) => String(row[h] ?? "")).join(" | "));
  }
  return lines.join("\n");
}

// Shared: pull the tool_use block out of a response and turn its raw
// candidates into validated ParsedDeal rows (or a skip reason), the same
// way regardless of whether the source was a table, free text, or an image.
function toolResponseToResult(response: Anthropic.Message, brokerState: string): ParseResult {
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) return { parsed: [], skipped: [] };

  const raw = toolUse.input as { deals?: Record<string, unknown>[] };
  const candidates = Array.isArray(raw.deals) ? raw.deals : [];

  const parsed: ParsedDeal[] = [];
  const skipped: { row: number; reason: string }[] = [];

  candidates.forEach((c, idx) => {
    const year = typeof c.year === "number" ? c.year : null;
    const make = typeof c.make === "string" && c.make.trim() ? c.make.trim() : null;
    const model = typeof c.model === "string" && c.model.trim() ? c.model.trim() : null;
    const msrp = typeof c.msrp === "number" ? c.msrp : null;
    const payment = typeof c.payment === "number" ? c.payment : null;
    const term = typeof c.term === "number" ? c.term : null;
    const dueAtSigning = typeof c.dueAtSigning === "number" ? c.dueAtSigning : null;

    const missing: string[] = [];
    if (!year) missing.push("year");
    if (!make || !model) missing.push("make/model");
    if (!msrp) missing.push("MSRP");
    if (!payment) missing.push("payment");
    if (!term) missing.push("term");
    if (!dueAtSigning) missing.push("due at signing");

    if (missing.length > 0) {
      skipped.push({ row: idx + 1, reason: `Couldn't determine: ${missing.join(", ")}` });
      return;
    }

    parsed.push({
      year: year!,
      make: make!,
      model: model!,
      trim: typeof c.trim === "string" && c.trim.trim() ? c.trim.trim() : null,
      msrp: msrp!,
      payment: payment!,
      term: term!,
      milesPerYear: typeof c.milesPerYear === "number" ? c.milesPerYear : null,
      dueAtSigning: dueAtSigning!,
      exterior: typeof c.exterior === "string" && c.exterior.trim() ? c.exterior.trim() : null,
      interior: typeof c.interior === "string" && c.interior.trim() ? c.interior.trim() : null,
      state: typeof c.state === "string" && c.state.trim() ? c.state.trim().toUpperCase() : brokerState,
      notes: typeof c.notes === "string" ? c.notes.trim() : "",
    });
  });

  return { parsed, skipped };
}

export async function parseRowsWithAI(
  rows: Record<string, unknown>[],
  brokerState: string
): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || rows.length === 0) return { parsed: [], skipped: [] };

  const table = rowsToTable(rows);
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_deals" },
    messages: [
      {
        role: "user",
        content:
          `Extract every car lease listing from this broker inventory sheet (pipe-delimited, first line is headers).\n\n` +
          `Columns vary by broker and cells are often combined (e.g. a "Model" column might read ` +
          `"2021 Taycan Turbo S (217k) CPO" meaning year 2021, make Porsche, model Taycan, trim ` +
          `"Turbo S", MSRP $217,000, condition CPO; a "Term" column might read "24 mo/ 7500 mi/ ` +
          `$5000 drive off" meaning term 24 months, 7500 miles/year, $5,000 due at signing; a spec ` +
          `column like "Chalk x black" means exterior Chalk, interior black). Use your knowledge of ` +
          `car makes/models to fill in make when only a model name is given. Tolerate typos. If a ` +
          `field genuinely isn't determinable for a row, use null for it rather than guessing — do ` +
          `not fabricate numbers. Skip rows that aren't actual vehicle listings (blank rows, totals, ` +
          `headers repeated mid-sheet, etc).\n\n${table}`,
      },
    ],
  });

  return toolResponseToResult(response, brokerState);
}

// Broker typed up one or more deals in plain language instead of a
// spreadsheet — e.g. pasted from a text thread or forum post.
export async function parseFreeTextWithAI(text: string, brokerState: string): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !text.trim()) return { parsed: [], skipped: [] };

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_deals" },
    messages: [
      {
        role: "user",
        content:
          `A broker typed up one or more car lease deals in plain language (not a spreadsheet). ` +
          `Extract every distinct vehicle listing you can find. Use your knowledge of car makes/models ` +
          `to fill in make when only a model name is given. If a field genuinely isn't mentioned, use ` +
          `null for it rather than guessing — do not fabricate numbers.\n\n${text}`,
      },
    ],
  });

  return toolResponseToResult(response, brokerState);
}

export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

// Broker uploaded a screenshot (text thread, forum post, spreadsheet, flyer,
// etc.) instead of typing anything — read it with vision and extract the
// same way.
//
// Phone screenshots are often several MB and thousands of pixels tall (a
// modern iPhone screenshot can be 1290x2796+, and base64 encoding adds ~33%
// on top of that). Claude's vision API silently rejects images that are too
// large/high-resolution, which is the most likely cause of "can't read the
// image" failures — so every upload is normalized here first: re-oriented,
// downscaled to a sane max dimension, and re-encoded as JPEG, regardless of
// what format/size it arrived in.
export async function parseImageWithAI(
  imageBuffer: Buffer,
  brokerState: string
): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !imageBuffer || imageBuffer.length === 0) return { parsed: [], skipped: [] };

  let base64: string;
  try {
    const resized = await sharp(imageBuffer)
      .rotate() // respect EXIF orientation (phone screenshots/photos)
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    base64 = resized.toString("base64");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Failed to process screenshot with sharp:", err);
    throw new Error(
      `That file doesn't look like a valid image (${message}). Please try a different screenshot or use "Add a car manually."`
    );
  }

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_deals" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64 },
            },
            {
              type: "text",
              text:
                `This is a screenshot of one or more car lease deals (a text message, forum post, ` +
                `spreadsheet, flyer, etc). Extract every distinct vehicle listing you can read. Use your ` +
                `knowledge of car makes/models to fill in make when only a model name is given. If a field ` +
                `genuinely isn't visible or determinable, use null for it rather than guessing — do not ` +
                `fabricate numbers.`,
            },
          ],
        },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Anthropic vision API call failed:", err);
    throw new Error(`AI couldn't read that screenshot (${message}).`);
  }

  return toolResponseToResult(response, brokerState);
}
