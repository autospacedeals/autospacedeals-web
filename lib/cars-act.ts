// California's CARS Act (SB 766, in effect since Oct 1, 2026): listings on
// Drive count as the dealer's own ads, so a dealership listing must show the
// vehicle's total price (deals.selling_price): the full sale price including
// every dealer fee, markup and installed add-on, with no rebates taken off —
// leaving out only what Vehicle Code 11713.1(e) allows (taxes, registration
// and other government fees, tire fee, certificate of compliance fee,
// finance charges, the doc fee, the e-filing fee, emissions testing). Brokers are encouraged, not required, pending legal
// review. Every listing version is also archived for 2+ years (deal_versions,
// supabase/migrations/0036_cars_act.sql). Client-safe.

export const TOTAL_PRICE_LABEL = "Total price";
// Shopper-facing: what's in and out of the number.
export const TOTAL_PRICE_NOTE = "Includes all dealer fees and add-ons, before rebates. Excludes taxes, government fees and the doc fee";
// Short form next to the price on cards and in conversations.
export const TOTAL_PRICE_SUFFIX = " + tax, gov't fees & doc fee";
// Seller-facing hint under the form field.
export const TOTAL_PRICE_HINT =
  "The full price including every dealer fee, markup and add-on, before any rebates. Leave out only taxes, registration/government fees, the doc fee and the e-filing fee. Required for dealership listings (California CARS Act); recommended for brokers.";

// Seller types that must show a total price on every live listing.
export function needsTotalPrice(sellerType: string | null | undefined): boolean {
  return sellerType === "Salesperson";
}

export const TOTAL_PRICE_REQUIRED_ERROR =
  "Add the car's total price: the full price including all dealer fees and add-ons, before rebates (leave out only taxes, government fees and the doc fee). California's CARS Act requires it on dealership listings.";

// The reply box's starting text when a seller first answers a shopper about
// a listing with a total price — the law wants it in the dealer's first
// written reply.
export function firstReplyDraft(totalPrice: number): string {
  return `Total price: $${Math.round(totalPrice).toLocaleString("en-US")} (includes all dealer fees and add-ons; plus taxes, government fees and the doc fee).\n\n`;
}

// The database backstop (deals_salesperson_total_price) as a readable message.
export function carsActError(message: string): string {
  return message.includes("deals_salesperson_total_price") ? TOTAL_PRICE_REQUIRED_ERROR : message;
}
