// Which way a car photo is shot — so stock photos can all be the same front
// three-quarter view with the nose to the left — and whether it's the right
// car at all. Small, fast vision model calls per candidate photo (only for
// photos not already in the library).
// SERVER-ONLY.
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

export type CarView = "front-left" | "front-right" | "rear" | "side" | "front" | "other" | "unknown";

// The angle check is tuned on this model; the newer one is better at telling
// lookalike models apart but less reliable on the angle.
const VIEW_MODEL = "claude-haiku-4-5-20251001";
const MATCH_MODEL = "claude-haiku-5-5";

export interface CarPhotoCheck {
  view: CarView;
  // Whether it shows the right car (make and model, any trim or color):
  // null when the check couldn't run.
  matches: boolean | null;
}

async function smallJpeg(image: Buffer): Promise<string> {
  // Small JPEG is plenty to tell the angle and the model, and keeps the calls cheap.
  const jpeg = await sharp(image).resize({ width: 512, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg().toBuffer();
  return jpeg.toString("base64");
}

async function ask(model: string, jpeg: string, text: string, extra: object = {}): Promise<string> {
  const res = await new Anthropic().messages.create({
    model,
    max_tokens: 20,
    ...extra,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg } },
          { type: "text", text },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  // The answer is the first line; anything after it is ignored.
  return (block?.text ?? "").trim().toLowerCase().split("\n")[0];
}

export async function classifyCarView(image: Buffer): Promise<CarView> {
  if (!process.env.ANTHROPIC_API_KEY) return "unknown";
  try {
    const word = await ask(
      VIEW_MODEL,
      await smallJpeg(image),
      "Which view of the car is this? Answer with exactly one word: front-left (front three-quarter: " +
        "the grille and both headlights are clearly visible along with the side, nose toward the left " +
        "of the image), front-right (the same but nose toward the right), rear (any rear or rear " +
        "three-quarter view), side (a profile or near-profile where the grille is barely visible or " +
        "not at all), front (straight-on), or other."
    );
    if (word.startsWith("front-left")) return "front-left";
    if (word.startsWith("front-right")) return "front-right";
    if (word.startsWith("rear")) return "rear";
    if (word.startsWith("side")) return "side";
    if (word.startsWith("front")) return "front";
    return "other";
  } catch (err) {
    console.error("classifyCarView failed:", err instanceof Error ? err.message : err);
    return "unknown";
  }
}

// Whether the photo shows that car — photo searches return lookalikes (a
// Range Rover for a Range Rover Sport, an Elantra for a Santa Fe Hybrid).
export async function photoMatchesCar(
  image: Buffer,
  car: { year: number; make: string; model: string }
): Promise<boolean | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    // Asked alongside the view (the wording that tested most accurate);
    // only the second word, the yes/no, is used.
    const line = await ask(
      MATCH_MODEL,
      await smallJpeg(image),
      "Answer with exactly two words separated by a space.\n" +
        "Word 1, which view of the car this is: front-left (front three-quarter: the grille and both " +
        "headlights are clearly visible along with the side, nose toward the left of the image), " +
        "front-right (the same but nose toward the right), rear (any rear or rear three-quarter view), " +
        "side (a profile or near-profile where the grille is barely visible or not at all), front " +
        "(straight-on), or other (interior, close-up, several cars, or no car).\n" +
        `Word 2: is the main car a ${car.make} ${car.model} (any trim or color, model years ` +
        `${car.year - 2} to ${car.year})? yes or no. Answer no if it's a different model, including a ` +
        "different size or body of a model with a similar name (for example a full-size Range Rover is " +
        "not a Range Rover Sport).",
      // A quick look, not a reasoned answer: thinking would use up the budget.
      { thinking: { type: "disabled" } }
    );
    const answer = line.split(/\s+/)[1] ?? "";
    return answer.startsWith("yes") ? true : answer.startsWith("no") ? false : null;
  } catch (err) {
    console.error("photoMatchesCar failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function inspectCarPhoto(
  image: Buffer,
  car: { year: number; make: string; model: string }
): Promise<CarPhotoCheck> {
  const [view, matches] = await Promise.all([classifyCarView(image), photoMatchesCar(image, car)]);
  return { view, matches };
}
