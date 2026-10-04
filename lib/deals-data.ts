// Shared Deal types and option lists. Live inventory comes from Supabase
// (the `deals` table — see lib/supabase/deals.ts), which brokers manage from
// their dashboard; this file used to hold a hardcoded deals array before the
// database existed.

export type SellerType = "Broker" | "Salesperson";
export type DealType = "Lease" | "Finance";
export type FuelType = "Gas" | "Hybrid" | "PHEV" | "EV";
export type BodyStyle =
  | "Sedan"
  | "SUV"
  | "Truck"
  | "Coupe"
  | "Minivan"
  | "Hatchback";
export type VehicleCondition = "New" | "Loaner" | "Demo" | "CPO" | "Used";

export interface Incentive {
  name: string;
  amount: number;
  // Whether the advertised payment/due-at-signing already assumes this
  // incentive is applied. Missing/undefined on older rows saved before this
  // field existed — treated as false (not already included) wherever read.
  includedInPrice?: boolean;
  // How much the monthly payment moves with vs. without this incentive,
  // when the source states it that way (e.g. "no Loyalty +$15" -> 15). When
  // set, the payment estimator uses it directly instead of spreading
  // `amount` over the term. `amount` may be 0 when only this is known.
  monthly?: number;
}

// Another annual mileage allowance offered on a lease, and how much it
// changes the advertised monthly payment (e.g. "12k +$45" -> { 12000, 45 };
// a lower allowance can be negative). The advertised milesPerYear itself
// isn't listed.
export interface MileageOption {
  milesPerYear: number;
  monthlyDelta: number;
}

export interface Deal {
  id: string;
  slug: string;

  // Vehicle. Only year/make/model are guaranteed — trim, body style, fuel,
  // and exterior/interior color are all optional (a broker may not know or
  // bother listing them), so treat empty string / null as "not specified"
  // wherever these are displayed.
  year: number;
  make: string;
  model: string;
  trim: string; // "" if not specified
  bodyStyle: BodyStyle | null;
  fuel: FuelType | null;
  exterior: string; // "" if not specified
  interior: string; // "" if not specified

  // Deal
  dealType: DealType;
  msrp: number;
  sellingPrice: number | null; // negotiated price before tax — used to calc MSRP discount; null if not provided
  payment: number; // monthly payment
  dueAtSigning: number; // due at signing (lease) or down payment (finance)
  term: number; // months
  milesPerYear: number | null; // null for finance deals
  apr: number | null; // annual %, only used for finance deals

  // Seller
  sellerType: SellerType;
  sellerName: string;
  // No phone/email: shoppers reach sellers only through Drive's messaging.
  city: string;
  state: string; // 2-letter code
  // Links to the broker's public About page — null for sample/legacy
  // listings that aren't tied to a real broker account.
  brokerId?: string | null;

  // Trust / status
  verified: boolean; // legacy — no longer shown in the UI (replaced by `condition`), kept for the DB column
  condition?: VehicleCondition | null; // shown on the listing photo in place of the old "Verified" badge
  inStock: boolean;
  popularity: number; // 0-100, used for "Most popular" sort
  datePosted: string; // ISO date (YYYY-MM-DD)

  // Content
  badge?: string;
  notes: string;
  packages: string[];
  images: string[];
  // True when the photo came from our CarsXE auto-lookup or the generic
  // placeholder rather than a broker upload — the UI discloses this since
  // it isn't guaranteed to be the exact vehicle.
  photoAutoSourced?: boolean;

  // Optional: the broker's stated assumed tax rate baked into their
  // advertised due-at-signing figure (e.g. 7.75 for "assumes 7.75% tax") —
  // purely a disclosed label, never used in any calculation. Null/undefined
  // means no assumption was stated.
  dueAtSigningTaxRate?: number | null;

  // Same idea as dueAtSigningTaxRate, but for the advertised monthly
  // payment — set when a broker discloses that the payment shown already
  // has an assumed tax rate baked in (rather than being pre-tax).
  paymentTaxRate?: number | null;

  // A broker/doc/service fee, disclosed as its own dollar amount and shown
  // as a separate line item — replaces the old vague "may not include
  // broker fee" disclaimer on due-at-signing. Null/undefined means not
  // disclosed.
  brokerFee?: number | null;
  // Multiple security deposits the advertised payment assumes (count) and
  // their refundable total, paid at signing on top of dueAtSigning. Null =
  // no MSDs.
  msdCount?: number | null;
  msdTotal?: number | null;

  // When true, the public MSRP display masks digits (e.g. "$49,XXX")
  // instead of showing the exact figure — set automatically when a broker
  // types x's into the MSRP field.
  maskMsrp?: boolean;

  // The literal masked MSRP text a broker typed (e.g. "$54,XXX"), used
  // verbatim for display when maskMsrp is true. Null for unmasked
  // listings, or for masked listings from before this field existed
  // (those fall back to auto-masking the last 3 digits of `msrp`).
  msrpMaskedLabel?: string | null;

  // Publishing lifecycle: "published" (live), "draft" (staged, awaiting
  // the broker's confirmation), or "removed" (soft-deleted — kept around,
  // with removedAt set, so the broker can see when it came down and
  // restore it if needed, instead of the row just disappearing).
  status?: "draft" | "published" | "removed";
  removedAt?: string | null;

  // The live Google Sheet sync that created this listing (null for cars
  // added by hand, from photos/pasted text, or a one-off upload). Only
  // loaded on the broker dashboard, which groups listings by it.
  sheetSyncId?: string | null;
  // The tab of that sheet it came from.
  sheetTab?: string | null;

  // Set when the seller is a dealership salesperson (sellerType
  // "Salesperson") rather than an independent broker — the dealership
  // they work at, shown alongside their own name wherever the seller is
  // displayed. Null for brokers/dealers.
  sellerDealership?: string | null;
  // Stackable incentives (loyalty, fleet, military, etc.) a shopper can
  // toggle on the deal page to see the effect on their estimated payment.
  // Broker-managed; AI can suggest starting points but never publishes
  // amounts without broker review.
  incentives?: Incentive[];
  // Other mileage allowances a shopper can pick in the payment estimator.
  // Empty/undefined when the listing only offers its advertised mileage.
  mileageOptions?: MileageOption[];
  // Whether the car can get to a shopper outside its area (see
  // lib/deal-location.ts). Null/undefined = not stated.
  delivery?: "pickup" | "in_state" | "nationwide" | null;

  // Provenance — where this listing came from. Optional; used for real deals
  // pulled from a broker's public posts (e.g. their Leasehackr thread) so we
  // can trace it back and re-verify pricing later.
  sourceUrl?: string;

  // Sample/demo listing flag. True for placeholder deals used to fill out
  // the site before we have a full pipeline of real broker/dealer inventory.
  // Sample listings use stock photos that are NOT guaranteed to match the
  // exact year/trim — they're illustrative only, and the UI must badge them
  // clearly so nobody mistakes a sample listing for a real, verified one.
  sample?: boolean;

  // One-pay lease flag. Some exotic/luxury deals are structured as a single
  // upfront lump-sum payment for the whole term rather than a monthly bill.
  // For these, set payment: 0 and dueAtSigning to the full one-pay amount —
  // the UI shows dueAtSigning as the headline total instead of a "/mo" price,
  // and the existing effectiveMonthly() math still spreads it correctly.
  onePay?: boolean;
}

export const BODY_STYLES: BodyStyle[] = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
export const FUEL_TYPES: FuelType[] = ["Gas", "Hybrid", "PHEV", "EV"];
