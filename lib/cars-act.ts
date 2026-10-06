// California's CARS Act (SB 766, in effect since Oct 1, 2026): listings on
// Drive count as the dealer's own ads, so a dealership listing must show the
// vehicle's total price — the selling price before taxes and government fees
// (deals.selling_price). Brokers are encouraged, not required, pending legal
// review. Every listing version is also archived for 2+ years (deal_versions,
// supabase/migrations/0036_cars_act.sql). Client-safe.

export const TOTAL_PRICE_LABEL = "Total price";
export const TOTAL_PRICE_NOTE = "Vehicle price before taxes and government fees";

// Seller types that must show a total price on every live listing.
export function needsTotalPrice(sellerType: string | null | undefined): boolean {
  return sellerType === "Salesperson";
}

export const TOTAL_PRICE_REQUIRED_ERROR =
  "Add the car's total price (before taxes and government fees). California's CARS Act requires it on dealership listings.";

// The reply box's starting text when a seller first answers a shopper about
// a listing with a total price — the law wants it in the dealer's first
// written reply.
export function firstReplyDraft(totalPrice: number): string {
  return `Total price: $${Math.round(totalPrice).toLocaleString("en-US")} (vehicle price before taxes and government fees).\n\n`;
}

// The database backstop (deals_salesperson_total_price) as a readable message.
export function carsActError(message: string): string {
  return message.includes("deals_salesperson_total_price") ? TOTAL_PRICE_REQUIRED_ERROR : message;
}
