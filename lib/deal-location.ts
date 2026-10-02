// Where a listed car is and whether it can get to a shopper elsewhere.
// Each listing has its own city/region + state (defaulting to the broker's
// own), since one broker can have cars in several places, plus an optional
// delivery setting. Client-safe.
import { US_STATE_CENTROIDS } from "./us-geo";

export type DeliveryOption = "pickup" | "in_state" | "nationwide";

export const DELIVERY_OPTIONS: { value: DeliveryOption; label: string }[] = [
  { value: "pickup", label: "Pick-up only" },
  { value: "in_state", label: "Delivers in-state" },
  { value: "nationwide", label: "Ships nationwide" },
];

export function deliveryLabel(value: DeliveryOption | null | undefined): string | null {
  return DELIVERY_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export function parseDelivery(raw: unknown): DeliveryOption | null {
  return DELIVERY_OPTIONS.some((o) => o.value === raw) ? (raw as DeliveryOption) : null;
}

// "ca" / " CA " -> "CA"; null unless it's a real state (or DC).
export function parseStateCode(raw: unknown): string | null {
  const code = String(raw ?? "").trim().toUpperCase();
  return code in US_STATE_CENTROIDS ? code : null;
}

export const US_STATE_CODES = Object.keys(US_STATE_CENTROIDS).sort();

export function cleanCity(raw: unknown): string | null {
  const city = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return city || null;
}

// The location fields every car form submits (city, state, delivery). A
// blank city/state falls back to `fallback` (the broker's own) when given.
export function parseLocationFields(
  formData: FormData,
  fallback?: { city: string; state: string }
): { city: string; state: string; delivery: DeliveryOption | null } | { error: string } {
  const city = cleanCity(formData.get("city")) ?? fallback?.city ?? null;
  const stateRaw = String(formData.get("state") ?? "").trim();
  const state = stateRaw ? parseStateCode(stateRaw) : (fallback?.state ?? null);
  if (stateRaw && !state) return { error: "Pick the state the car is in." };
  if (!city || !state) return { error: "Add where the car is — a city or region and a state." };
  return { city, state, delivery: parseDelivery(formData.get("delivery")) };
}
