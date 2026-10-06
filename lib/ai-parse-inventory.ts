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
import { parseMsdText, type ParsedDeal, type ParseResult, type SkippedRow } from "./parse-inventory";
import { sanitizeIncentives, sanitizeLeaseOptions, sanitizeMileageOptions } from "./deal-options";
import { cleanCity, parseDelivery, parseStateCode } from "./deal-location";
import type { Incentive } from "./deals-data";

function toParsedIncentives(list: Incentive[]): NonNullable<ParsedDeal["incentives"]> {
  return list.map((i) => ({ ...i, includedInPrice: i.includedInPrice === true }));
}

const MODEL = "claude-opus-5";

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
            sourceRow: {
              type: ["number", "null"],
              description:
                "For a table with a # column: the # of the row this listing was read from. null otherwise.",
            },
            year: { type: "number", description: "4-digit model year" },
            make: { type: "string", description: "Manufacturer, e.g. Porsche" },
            model: { type: "string", description: "Model name, e.g. Taycan" },
            trim: { type: ["string", "null"], description: "Trim/spec if mentioned, else null" },
            msrp: { type: ["number", "null"], description: "MSRP in dollars, e.g. 217000 for \"217k\"" },
            sellingPrice: {
              type: ["number", "null"],
              description:
                "The vehicle's total / selling / sale price in dollars when the ad states one (\"selling " +
                "price $48,250\", \"sale price\", \"total price\", \"cap cost\", \"net price\") — the " +
                "price of the car before taxes and government fees. NOT the MSRP, NOT the monthly " +
                "payment, NOT due at signing. null if not stated; never estimate it.",
            },
            onePay: {
              type: "boolean",
              description:
                "true if this is a one-pay lease — a single upfront lump sum with no separate " +
                "monthly bill, often flagged with the word \"ONEPAY\"/\"one-pay\". When true, " +
                "payment should be null and the full one-pay total goes in dueAtSigning instead.",
            },
            payment: {
              type: ["number", "null"],
              description: "Monthly payment in dollars — null if this is a one-pay lease (see onePay)",
            },
            term: { type: ["number", "null"], description: "Lease term in months" },
            milesPerYear: { type: ["number", "null"], description: "Mileage allowance per year" },
            dueAtSigning: {
              type: ["number", "null"],
              description:
                "Due at signing / drive-off in dollars — or the full one-pay total if onePay is true",
            },
            exterior: { type: ["string", "null"], description: "Exterior color" },
            interior: { type: ["string", "null"], description: "Interior color" },
            brokerFee: {
              type: ["number", "null"],
              description:
                "A broker/doc/service fee called out as its own dollar amount, e.g. \"$699 broker " +
                "fee\" -> 699. null if none is mentioned. This is a separate field from " +
                "dueAtSigning — don't fold it into that number, and don't just leave it in notes.",
            },
            msdCount: {
              type: ["number", "null"],
              description:
                "Number of multiple security deposits (MSDs) the advertised payment assumes, e.g. " +
                "\"w/ 7 MSDs\" or \"7 MSD\" -> 7. null if MSDs aren't mentioned.",
            },
            msdTotal: {
              type: ["number", "null"],
              description:
                "Total refundable MSD amount in dollars if stated (e.g. \"$6,300 in MSDs\" -> 6300). " +
                "null if not stated. Never add it into dueAtSigning.",
            },
            state: {
              type: ["string", "null"],
              description: "2-letter US state code, inferred from any region/city mentioned (e.g. \"Socal\" -> CA)",
            },
            city: {
              type: ["string", "null"],
              description:
                "Where the car is, as the ad names it — a city or region like \"SoCal\", \"Bay Area\" " +
                "or \"Phoenix\" (\"Southern California\" -> \"SoCal\"). null if not stated. Never a state " +
                "name alone (that's the state field).",
            },
            delivery: {
              type: ["string", "null"],
              enum: ["pickup", "in_state", "nationwide", null],
              description:
                "Whether the car can get to a buyer elsewhere, if the ad says: \"pick-up only\" / " +
                "\"shipping not available\" -> pickup; delivery within the state -> in_state; " +
                "\"ships nationwide\" / \"we ship anywhere\" / \"delivery available to all 50 states\" -> " +
                "nationwide. null if not stated.",
            },
            incentives: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  name: { type: "string", description: "Program name as the ad writes it, e.g. \"Loyalty\"" },
                  amount: {
                    type: ["number", "null"],
                    description: "Dollar value the ad states for it (\"$500 Loyalty\" -> 500), else null",
                  },
                  monthly: {
                    type: ["number", "null"],
                    description:
                      "How much the monthly payment goes up without it, when the ad says so " +
                      "(\"no Loyalty +$15\" -> 15), else null",
                  },
                  includedInPrice: {
                    type: "boolean",
                    description:
                      "true if the advertised payment already assumes it (\"rebates already " +
                      "included\", \"w/ loyalty\", or a \"no X +$15\" surcharge), false if it's an " +
                      "extra a shopper could add on top",
                  },
                },
                required: ["name", "amount", "monthly", "includedInPrice"],
              },
              description:
                "Incentive/rebate programs the ad gives a value for — a dollar amount, a monthly " +
                "difference, or both. Read the values exactly as the ad states them; never estimate " +
                "one. Programs written together as alternatives (\"A-Plan / Affinity\") are ONE " +
                "program. A program the advertised price depends on but with no value stated " +
                "(\"$330 plus tax (with MyFirstEV)\", \"loyalty required\") is listed too, with " +
                "amount null, monthly null and includedInPrice true — never guess its value. A " +
                "program merely mentioned, that the price doesn't depend on, just goes in notes. " +
                "Empty array if none.",
            },
            mileageOptions: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  milesPerYear: { type: "number", description: "Annual miles, e.g. 12000 for \"12k\"" },
                  monthlyDelta: {
                    type: "number",
                    description: "Change to the monthly payment, e.g. 45 for \"+$45\" (negative if cheaper)",
                  },
                },
                required: ["milesPerYear", "monthlyDelta"],
              },
              description:
                "Other annual mileage allowances the ad prices relative to the advertised payment, " +
                "e.g. \"10k $23 · 12k $45 · 15k $90\" (the add-on per month for each) -> " +
                "[{10000,23},{12000,45},{15000,90}]. Don't include the advertised milesPerYear " +
                "itself. Empty array if none are listed.",
            },
            otherTerms: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  term: { type: "number", description: "Lease length in months, e.g. 36" },
                  milesPerYear: { type: ["number", "null"], description: "Annual miles for this price, e.g. 10000" },
                  payment: { type: "number", description: "Monthly payment for this term and mileage" },
                },
                required: ["term", "milesPerYear", "payment"],
              },
              description:
                "Every OTHER lease term the ad prices for this same car, each with its own mileage " +
                "and monthly payment — e.g. under one car: \"24/7500 - $330 · 36/7500 - $345 · " +
                "36/10k - $356\" with term 24 / 7500 / $330 as the main price -> " +
                "[{36,7500,345},{36,10000,356}] (and 24/10k goes in mileageOptions as a +/- " +
                "against the main payment). Use the first price listed for the car as the main " +
                "term/mileage/payment. Never list the main term/mileage itself, and never make " +
                "these into separate cars. Empty array if only one term is priced.",
            },
            notes: {
              type: "string",
              description:
                "Anything else worth keeping — condition (CPO/loaner/demo), package/option names, or other details that didn't fit a field above. Empty string if nothing.",
            },
          },
          required: ["year", "make", "model", "notes"],
        },
      },
    },
    required: ["deals"],
  },
};

// Shared across all three extraction entry points (table, free text, image)
// so the combined-cell conventions these sheets/screenshots use are
// recognized consistently everywhere — this used to live only in the table
// prompt, which meant the vision path (screenshots) had no idea "(59k)"
// right after a model name means MSRP $59,000, not mileage, and would
// rather return null than guess. That silently dropped MSRP on otherwise
// perfectly legible screenshots.
const COMBINED_CELL_GUIDANCE =
  `Columns/cells are frequently combined rather than one-field-per-column. For example: a vehicle ` +
  `name like "2021 Taycan Turbo S (217k) CPO" means year 2021, make Porsche, model Taycan, trim ` +
  `"Turbo S", MSRP $217,000, condition CPO — a parenthetical number right after the model/trim name ` +
  `followed by "k" is MSRP in thousands (217k -> 217000), NOT mileage, even when the vehicle is new; ` +
  `mileage allowance is always given separately (e.g. "7500 mi"). That parenthetical MSRP marker is ` +
  `never part of the trim itself — pull the number out into the msrp field and leave it out of trim ` +
  `entirely (e.g. "eDrive40 (59k)" is trim "eDrive40" + msrp 59000, never trim "eDrive40 (59k)"). A ` +
  `term/lease-terms cell like "36 mo / 7500 mi / $3500 driveoff" means term 36 months, 7500 ` +
  `miles/year, $3,500 due at signing. A spec cell like "Chalk x black" or "Black x Black" means ` +
  `exterior Chalk, interior black. A price cell like "$74,990 ONEPAY" means this is a one-pay lease ` +
  `— set onePay true, payment null, and put $74,990 in dueAtSigning as the full one-pay total. A ` +
  `"Fees" column or a note like "$699 broker fee" or "$999 doc fee" belongs in the brokerFee field, ` +
  `not just left in notes. When the ad states an incentive's value — a dollar amount like "$500 ` +
  `Loyalty", or what the payment becomes without it like "no Loyalty +$15" (monthly 15) — put it in ` +
  `incentives with exactly those numbers. Price modifiers like "10k $23 · 12k $45 · 15k $90" next to ` +
  `a 7,500-mile deal are mileage tiers (mileageOptions), not incentives. Banner text such as "rebates ` +
  `already included in these prices: Loyalty & A-Plan" applies to every vehicle under it. When the ` +
  `price depends on a program the ad gives no value for ("$330 plus tax (with MyFirstEV)"), list it ` +
  `in incentives with amount and monthly null and includedInPrice true; never guess a number. A ` +
  `car priced at several terms ("24/7500 $330 · 36/7500 $345 · 36/10k $356") is ONE car: the first ` +
  `price is its main term/mileage/payment, other mileages at that term are mileageOptions, and ` +
  `other terms are otherTerms. Terms stated ` +
  `ONCE for the whole image, sheet or message — e.g. a shared banner, header or footer strip like ` +
  `"$3,000 TOTAL DRIVE-OFF · 7,500 MILES PER YEAR · 24 MONTH LEASE" under several cars, or a line ` +
  `like "all deals 36/10k, $3k das" — apply to EVERY vehicle listed, not just the one printed ` +
  `nearest to them, unless a vehicle states its own value for that field. Due at signing is often ` +
  `called "drive-off", "total drive-off", "drive off", "DAS", "due at signing", "at signing", ` +
  `"initial payment" or "out of pocket"; "sign and drive" / "$0 down $0 due" means 0. "w/ 7 MSDs" ` +
  `(multiple security deposits) goes in msdCount (7), and a stated MSD dollar total in msdTotal — ` +
  `MSDs are refundable and separate from due at signing, so never add them into dueAtSigning. A ` +
  `vehicle whose name/trim is crossed out (strikethrough) — or most of whose row is — is sold or no ` +
  `longer available: leave it out entirely, even if its other cells look normal. Only a lone ` +
  `crossed-out old price sitting next to a new one is different: use the new price. A location or ` +
  `shipping banner over a group of cars (e.g. "Southern California — pick-up only, shipping not ` +
  `available") applies to every car under it until another one starts: city "SoCal", state CA, ` +
  `delivery "pickup".`;

// Pipe-delimited table, headers first. With `ids`, a leading # column
// numbers each row so the model can say which row each listing came from.
function rowsToTable(rows: Record<string, unknown>[], ids?: number[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [(ids ? ["#", ...headers] : headers).join(" | ")];
  for (const [i, row] of rows.entries()) {
    const cells = headers.map((h) => String(row[h] ?? ""));
    lines.push((ids ? [String(ids[i]), ...cells] : cells).join(" | "));
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
  const skipped: SkippedRow[] = [];

  candidates.forEach((c, idx) => {
    const sourceRow = typeof c.sourceRow === "number" ? c.sourceRow : undefined;
    const year = typeof c.year === "number" ? c.year : null;
    const make = typeof c.make === "string" && c.make.trim() ? c.make.trim() : null;
    const model = typeof c.model === "string" && c.model.trim() ? c.model.trim() : null;
    const msrp = typeof c.msrp === "number" ? c.msrp : null;
    // The vehicle's total price (California's CARS Act wants it on dealer ads).
    const sellingPrice =
      typeof c.sellingPrice === "number" && c.sellingPrice > 1000 && c.sellingPrice < 2000000 ? c.sellingPrice : null;
    // Some rows also mention "onepay"/"one-pay" in notes even when the
    // model didn't set the boolean flag on the field itself — catch that
    // too rather than depending entirely on the model populating onePay.
    const onePay =
      c.onePay === true || (typeof c.notes === "string" && /\bone[\s-]?pay\b/i.test(c.notes));
    const payment = typeof c.payment === "number" ? c.payment : null;
    const term = typeof c.term === "number" ? c.term : null;
    const dueAtSigning = typeof c.dueAtSigning === "number" ? c.dueAtSigning : null;
    // A one-pay total might land in either field depending on how the model
    // read the sheet (a "Price"-style column reads naturally as "payment"
    // even though there's no actual monthly bill) — accept whichever one
    // the model actually populated as the lump-sum total.
    const oneTimeTotal = onePay ? dueAtSigning ?? payment : dueAtSigning;
    const trim = typeof c.trim === "string" && c.trim.trim() ? c.trim.trim() : null;
    const exterior = typeof c.exterior === "string" && c.exterior.trim() ? c.exterior.trim() : null;
    const interior = typeof c.interior === "string" && c.interior.trim() ? c.interior.trim() : null;
    const brokerFee = typeof c.brokerFee === "number" ? c.brokerFee : null;
    // The model's MSD fields, falling back to anything it left in the notes.
    const msdFromNotes = parseMsdText(typeof c.notes === "string" ? c.notes : "");
    const msdCountRaw = typeof c.msdCount === "number" ? c.msdCount : msdFromNotes.msdCount;
    const msdCount =
      msdCountRaw != null && Number.isInteger(msdCountRaw) && msdCountRaw >= 1 && msdCountRaw <= 20
        ? msdCountRaw
        : null;
    const msdTotalRaw = typeof c.msdTotal === "number" ? c.msdTotal : msdFromNotes.msdTotal;
    const msdTotal = msdCount != null && msdTotalRaw != null && msdTotalRaw > 0 ? msdTotalRaw : null;
    const state = parseStateCode(c.state) ?? brokerState;
    const city = cleanCity(c.city);
    const delivery = parseDelivery(c.delivery);
    const notes = typeof c.notes === "string" ? c.notes.trim() : "";
    const milesPerYear = typeof c.milesPerYear === "number" ? c.milesPerYear : null;
    // Incentives with a stated value, kept as read — never looked up.
    const statedIncentives = sanitizeIncentives(c.incentives);
    const mileageOptions = sanitizeMileageOptions(c.mileageOptions, milesPerYear);
    const leaseOptions = onePay ? [] : sanitizeLeaseOptions(c.otherTerms, { term, milesPerYear });

    const missing: string[] = [];
    if (!year) missing.push("year");
    if (!make || !model) missing.push("make/model");
    if (!msrp) missing.push("MSRP");
    if (!onePay && !payment) missing.push("payment");
    if (!term) missing.push("term");
    if (!oneTimeTotal) missing.push("due at signing");

    if (missing.length > 0) {
      // Carry through whatever WAS read (often everything but one field,
      // like MSRP) so the broker's fallback form comes pre-filled instead
      // of blank — they only need to fix the one thing the AI couldn't get.
      const partial: Partial<ParsedDeal> = { onePay };
      if (year) partial.year = year;
      if (make) partial.make = make;
      if (model) partial.model = model;
      if (trim) partial.trim = trim;
      if (msrp) partial.msrp = msrp;
      if (sellingPrice) partial.sellingPrice = sellingPrice;
      if (!onePay && payment) partial.payment = payment;
      if (term) partial.term = term;
      if (milesPerYear) partial.milesPerYear = milesPerYear;
      if (oneTimeTotal) partial.dueAtSigning = oneTimeTotal;
      if (exterior) partial.exterior = exterior;
      if (interior) partial.interior = interior;
      if (brokerFee) partial.brokerFee = brokerFee;
      if (msdCount) partial.msdCount = msdCount;
      if (msdTotal) partial.msdTotal = msdTotal;
      if (state) partial.state = state;
      if (city) partial.city = city;
      if (delivery) partial.delivery = delivery;
      if (notes) partial.notes = notes;
      if (statedIncentives.length > 0) partial.incentives = toParsedIncentives(statedIncentives);
      if (mileageOptions.length > 0) partial.mileageOptions = mileageOptions;
      if (leaseOptions.length > 0) partial.leaseOptions = leaseOptions;
      skipped.push({ row: sourceRow ?? idx + 1, reason: `Couldn't determine: ${missing.join(", ")}`, partial });
      return;
    }

    parsed.push({
      year: year!,
      make: make!,
      model: model!,
      trim,
      msrp: msrp!,
      sellingPrice,
      payment: onePay ? 0 : payment!,
      term: term!,
      milesPerYear,
      dueAtSigning: oneTimeTotal!,
      exterior,
      interior,
      brokerFee,
      msdCount,
      msdTotal,
      state,
      city,
      delivery,
      notes,
      onePay,
      incentives: toParsedIncentives(statedIncentives),
      mileageOptions,
      leaseOptions,
      sourceRow,
    });
  });

  return { parsed, skipped };
}

export async function parseRowsWithAI(
  rows: Record<string, unknown>[],
  brokerState: string,
  // For one batch of a bigger sheet (see parseTabs in parse-inventory.ts):
  // each row's sheet row number, so listings can be traced back to their
  // row, and the tab's banner/note rows from elsewhere in the sheet.
  options: { rowIds?: number[]; context?: string } = {}
): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || rows.length === 0) return { parsed: [], skipped: [] };

  const table = rowsToTable(rows, options.rowIds);
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    // Room for a full batch (~20 rows) of listings with incentives and
    // mileage tiers; callers split bigger sheets into batches.
    max_tokens: 16000,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_deals" },
    messages: [
      {
        role: "user",
        content:
          `Extract every car lease listing from this broker inventory sheet (pipe-delimited, first line is headers` +
          `${options.rowIds ? "; the # column is each row's number in the sheet — put it in sourceRow" : ""}).\n\n` +
          `Columns vary by broker. ${COMBINED_CELL_GUIDANCE} ` +
          `Use your knowledge of car makes/models to fill in make when only a model name is given. ` +
          `Tolerate typos. If a field genuinely isn't determinable for a row, use null for it ` +
          `rather than guessing — do not fabricate numbers. Skip rows that aren't actual vehicle ` +
          `listings (blank rows, totals, headers repeated mid-sheet, etc).\n\n` +
          (options.context
            ? `This is one part of a longer sheet. These banner/note rows (with their sheet row numbers) ` +
              `are on the same tab. Don't list them as cars. A banner about location, shipping, or terms ` +
              `for "the cars below" applies only to rows with a HIGHER # than the banner, up to the next ` +
              `banner of the same kind — never to rows above it. A note that clearly covers the whole ` +
              `sheet (e.g. "all prices include loyalty") applies to every row.\n${options.context}\n\nRows to extract:\n`
            : "") +
          table,
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
          `Extract every distinct vehicle listing you can find. ${COMBINED_CELL_GUIDANCE} ` +
          `Use your knowledge of car makes/models to fill in make when only a model name is given. ` +
          `If a field genuinely isn't mentioned, use null for it rather than guessing — do not ` +
          `fabricate numbers.\n\n${text}`,
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
                `spreadsheet, flyer, etc). Extract every distinct vehicle listing you can read. ` +
                `${COMBINED_CELL_GUIDANCE} Use your knowledge of car makes/models to fill in make ` +
                `when only a model name is given. If a field genuinely isn't visible or ` +
                `determinable, use null for it rather than guessing — do not fabricate numbers.`,
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
