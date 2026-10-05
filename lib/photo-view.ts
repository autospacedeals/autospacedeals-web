// Which way a car photo is shot — so stock photos can all be the same front
// three-quarter view with the nose to the left. A small, fast vision model
// call per candidate photo (only for photos not already in the library).
// SERVER-ONLY.
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

export type CarView = "front-left" | "front-right" | "rear" | "side" | "front" | "other" | "unknown";

const MODEL = "claude-haiku-4-5-20251001";

export async function classifyCarView(image: Buffer): Promise<CarView> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "unknown";
  try {
    // Small JPEG is plenty to tell the angle and keeps the call cheap.
    const jpeg = await sharp(image).resize({ width: 512, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg().toBuffer();
    const res = await new Anthropic({ apiKey }).messages.create({
      model: MODEL,
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
            {
              type: "text",
              text:
                "Which view of the car is this? Answer with exactly one word: front-left (front three-quarter: " +
                "the grille and both headlights are clearly visible along with the side, nose toward the left " +
                "of the image), front-right (the same but nose toward the right), rear (any rear or rear " +
                "three-quarter view), side (a profile or near-profile where the grille is barely visible or " +
                "not at all), front (straight-on), or other.",
            },
          ],
        },
      ],
    });
    const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const word = (block?.text ?? "").trim().toLowerCase();
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
