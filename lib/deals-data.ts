// =============================================================================
// Drive — Deal Inventory
// =============================================================================
// This file is the single source of truth for every deal shown on the site.
// It is plain TypeScript data (no database yet), so adding or editing a deal
// is as simple as copying a block below and changing the values.
//
// HOW TO ADD A NEW DEAL:
//   1. Copy any object inside the `deals` array below.
//   2. Give it a new unique `id` and `slug` (slug = URL-friendly name, e.g.
//      "2026-bmw-x5-xdrive40i-ca").
//   3. Fill in the real numbers from the dealer/broker's offer.
//   4. Save the file — the homepage and detail page update automatically.
//
// PHOTOS: Every deal's `images` array should point at a real, license-checked
// photo matched to that vehicle's year/make/model/trim/color (sourced via the
// CarsXE image API). Avoid generic stock photography — it can show the wrong
// model year or trim, which erodes trust in the listing.
// =============================================================================

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
  sellerPhone: string;
  sellerEmail: string;
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

// -----------------------------------------------------------------------------
// Deals
// -----------------------------------------------------------------------------
export const deals: Deal[] = [
  // ---------------------------------------------------------------------
  // Real deals below — sourced from Chrome Stallions' own public posts on
  // their Leasehackr marketplace thread. Chrome Stallions has given
  // permission to be listed on Drive. Prices reflect what the
  // broker posted; confirm current availability before publishing updates,
  // since brokers rotate these specials frequently (these were posted as
  // "May Specials" — reconfirm for the current month before launch).
  // ---------------------------------------------------------------------
  {
    id: "17",
    slug: "2026-mercedes-benz-glc-300-4matic-ca",
    year: 2026,
    make: "Mercedes-Benz",
    model: "GLC 300",
    trim: "4MATIC",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Polar White",
    interior: "Black",
    dealType: "Lease",
    msrp: 57000, // estimated — Chrome Stallions posts selling price, not full MSRP; confirm sticker with broker
    sellingPrice: 53000,
    payment: 299,
    dueAtSigning: 3500,
    term: 24,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 80,
    datePosted: "2026-07-04",
    badge: "HOT",
    notes:
      "Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household (proof of registration required). $599 broker fee is included in the due-at-signing total above. Serves both Norcal and Socal.",
    packages: ["AMG Line Lite Plus"],
    images: ["/cars/2026-mercedes-glc300-polar-white.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811",
  },
  {
    id: "18",
    slug: "2026-mercedes-benz-c300-ca",
    year: 2026,
    make: "Mercedes-Benz",
    model: "C300",
    trim: "Base",
    bodyStyle: "Sedan",
    fuel: "Gas",
    exterior: "Black",
    interior: "Beige",
    dealType: "Lease",
    msrp: 55500, // estimated — see note on GLC 300 above
    sellingPrice: 52000,
    payment: 379,
    dueAtSigning: 3500,
    term: 24,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 62,
    datePosted: "2026-07-04",
    badge: "VALUE",
    notes:
      "Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household (proof of registration required). $599 broker fee is included in the due-at-signing total above.",
    packages: ["Heated & Ventilated Seats", "19\" AMG Multispokes"],
    images: ["https://vehicle-images.carscommerce.inc/stock-images/chrome/3a20930987c9467048d312873b7913e5.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811",
  },
  {
    id: "19",
    slug: "2026-mercedes-benz-gle-450-coupe-ca",
    year: 2026,
    make: "Mercedes-Benz",
    model: "GLE 450 Coupe",
    trim: "Base",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Graphite Gray",
    interior: "Black",
    dealType: "Lease",
    msrp: 86500, // estimated — see note on GLC 300 above
    sellingPrice: 81000,
    payment: 729,
    dueAtSigning: 3500,
    term: 24,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 57,
    datePosted: "2026-07-04",
    badge: "NEW",
    notes:
      "Coupe-styled SUV. Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household (proof of registration required). $699 broker fee is included in the due-at-signing total above.",
    packages: ["Night Package", "Exclusive Trim"],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/A6ZVqgdvNgNS-tOdpleojQHoHqEV8nKHGlrR76ELO5XWtalKRnDL8BGHYut49a8CXEjwjGd_0bCnS3pA250bC5Ka5L8cIEayqQKh2BXLkRaF8_AqZlrL2kN2Xbx4u8s7I_b0sQ0ufjiaaQWPB2Vc7Hx-xz3FRAa249F-SycEZNiyodpt0DDRTn4MrQsCBsjsQOnu7vItCuU/cc_2026MBSA11972885_02_640_956.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811",
  },
  {
    id: "20",
    slug: "2025-porsche-macan-loaner-ca",
    year: 2025,
    make: "Porsche",
    model: "Macan",
    trim: "Base (Loaner)",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "White",
    interior: "Black",
    dealType: "Lease",
    msrp: 66000, // estimated — see note on GLC 300 above
    sellingPrice: 62000,
    payment: 699,
    dueAtSigning: 4995,
    term: 24,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 48,
    datePosted: "2026-07-04",
    badge: "VALUE",
    notes:
      "Former loaner unit with low miles, full factory warranty remaining. Payment is +tax. $499 broker fee is included in the due-at-signing total above.",
    packages: [],
    images: ["https://file.kelleybluebookimages.com/kbb/base/evox/CP/55153/2025-Porsche-Macan-front_55153_032_2400x1800_A1.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811",
  },

  // ---------------------------------------------------------------------
  // More real Chrome Stallions inventory — sourced from their BMW/Audi,
  // Mercedes/Porsche, and Exotics/Porsche/Land Rover threads (July 2026).
  // Broker fee is included in the due-at-signing total shown for each deal.
  // ---------------------------------------------------------------------
  {
    id: "21",
    slug: "2026-bmw-x5-xdrive40i-msport-skyscraper-gray-ca",
    year: 2026,
    make: "BMW",
    model: "X5",
    trim: "xDrive40i M Sport",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Skyscraper Gray",
    interior: "Black",
    dealType: "Lease",
    msrp: 84000, // estimated — Chrome Stallions posts selling price, not full MSRP; confirm sticker with broker
    sellingPrice: 78000,
    payment: 819,
    dueAtSigning: 3500,
    term: 39,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 68,
    datePosted: "2026-05-06",
    badge: "HOT",
    notes:
      "Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $599 broker fee is included in the due-at-signing total above.",
    packages: ["M Sport", "Parking Assistance", "21\" Wheels", "Trailer Hitch", "4-Zone Climate"],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkopc2mFsQ0AUs_xru79YZFSeXSVQkY2w4NlDrU74XvajDCTMdJdgADwu8ZxJ1V9jM9BMEarQAyVaolWMasMH1Tzf663PxdnfXkHzPXTfExsO0L3cz2eHhZCh3OfTtNXhqEzmBB7WGGJnohwhCnijuOjpR0qHuJvKIL7dogXDH0VYw5ojcjGgr7Uwsybs5-BLNw/cc_2026BMS191998062_01_640_C36.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812",
  },
  {
    id: "22",
    slug: "2026-bmw-i4-edrive40-black-real-ca",
    year: 2026,
    make: "BMW",
    model: "i4 eDrive40",
    trim: "Premium",
    bodyStyle: "Sedan",
    fuel: "EV",
    exterior: "Black",
    interior: "Black",
    dealType: "Lease",
    msrp: 66000,
    sellingPrice: 62000,
    payment: 435,
    dueAtSigning: 3500,
    term: 36,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 61,
    datePosted: "2026-05-06",
    badge: "EV",
    notes:
      "Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $599 broker fee is included in the due-at-signing total above.",
    packages: ["Premium Package", "Driving Assistance"],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkpewSF6eUJXr3lvFYdV-b4Is-XetRvtnAvIQGH-ZKq4PLJ2wjzesxpGlwXWIK56HSkiULTwl4u5LW-yXuLVeG2qURtorTZdK0uVoFWeriC8LQogCQacqNpEcwQnEe9KurMgyWT-1reon5Kc0ECzBS8ibtonSH-AnKQwiZWvo0Jndg/cc_2026BMCA12021366_01_640_475.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812",
  },
  {
    id: "23",
    slug: "2026-bmw-740i-brooklyn-gray-ca",
    year: 2026,
    make: "BMW",
    model: "740i",
    trim: "xDrive M-Sport Professional",
    bodyStyle: "Sedan",
    fuel: "Gas",
    exterior: "Brooklyn Gray",
    interior: "Mocha",
    dealType: "Lease",
    msrp: 112000,
    sellingPrice: 105000,
    payment: 899,
    dueAtSigning: 3500,
    term: 39,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 54,
    datePosted: "2026-05-06",
    badge: "NEW",
    notes:
      "Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $699 broker fee is included in the due-at-signing total above.",
    packages: ["Driving Assistance Pro", "Premium", "M-Sport Professional", "Alcantara Headliner"],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkqC4sTjZ1QIbMkqejuDBEg8x37QMnp4nmnDlruDNFrRqpuUSEIFtOcUQqnRZud1t6wHsoBQhZOt5KFWVGm2uawx8k_lOmwTSmBcaLXil7qk7BnvGhTBe_HDnQb2Juewvm3q0_Nqn7bdeGO9tgru7mF4-xXfAvTzoj9zD08ulFXjQg/cc_2026BMC082046588_01_640_C4P.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812",
  },
  {
    id: "24",
    slug: "2026-bmw-x3-30-white-ca",
    year: 2026,
    make: "BMW",
    model: "X3",
    trim: "30 xDrive",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "White",
    interior: "Beige",
    dealType: "Lease",
    msrp: 59000,
    sellingPrice: 55000,
    payment: 509,
    dueAtSigning: 3500,
    term: 39,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 57,
    datePosted: "2026-05-06",
    badge: "VALUE",
    notes:
      "Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $599 broker fee is included in the due-at-signing total above.",
    packages: ["Convenience Package", "Glow Grill"],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkoxFD7oJYIQxSKyjANEuKNyF29qOCq7Xsilj5Zke2lneSpOOg8cn9piDEPhQ1gjdgea7BVjXgjVgMtgmD30xD-L06mzfCqo5ya-cQi6wcvpFgY4Z7M7LGJF774Y40pmNGdgOdg1TOWZsqS6lWYsj-VXEsKcoaCOSCse0OTpKlmnbRgZFIOKKlQybvtt_jzYFMQQlKenPLNITQ/cc_2026BMS202001149_01_640_300.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812",
  },
  {
    id: "25",
    slug: "2025-audi-a5-premium-plus-loaner-ca",
    year: 2025,
    make: "Audi",
    model: "A5",
    trim: "Premium Plus",
    bodyStyle: "Sedan",
    fuel: "Gas",
    exterior: "Mythos Black",
    interior: "Black",
    dealType: "Lease",
    msrp: 54000,
    sellingPrice: 49000,
    payment: 319,
    dueAtSigning: 3000,
    term: 36,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 50,
    datePosted: "2026-05-06",
    badge: "VALUE",
    notes:
      "Loaner unit with low miles. Payment is +tax. Audi loyalty incentive may apply — ask broker for current eligibility. $699 broker fee is included in the due-at-signing total above.",
    packages: ["Warm Weather Package", "19\" Wheel Package"],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/yWhhamuIqoYVO2hbFBmRgVaCtskpU2OI-PGYbRSaYLFJWt2bWvCG-_v-oOdJGkurVSV4d9cHrmckwxAdmynBUMZzvFJomlG2EoWBIRl9Orkk3B4-265hLstgkUSqevWpo1R3LiKdZmbLmPPYQID5KYmGBH1LX_Mv0eHC2s0eMzawYOp7nwG8ohTVFzFLXncM/cc_2025AUC432047398_01_640_0E0E.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812",
  },
  {
    id: "26",
    slug: "2025-audi-s5-premium-plus-ca",
    year: 2025,
    make: "Audi",
    model: "S5",
    trim: "Premium Plus",
    bodyStyle: "Sedan",
    fuel: "Gas",
    exterior: "Black",
    interior: "Black",
    dealType: "Lease",
    msrp: 67000,
    sellingPrice: 63000,
    payment: 699,
    dueAtSigning: 3500,
    term: 36,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 46,
    datePosted: "2026-05-06",
    badge: "NEW",
    notes:
      "Payment is +tax. Audi loyalty incentive may apply — ask broker for current eligibility. $599 broker fee is included in the due-at-signing total above.",
    packages: ["Sports Seats Plus", "Sport Adaptive Damping Suspension"],
    images: ["https://autoimage.capitalone.com/stock-media/chrome/2025-Audi-S5-Premium_Plus-0E0E-cc_2025AUC441987508_01_2100_0E0E.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812",
  },
  {
    id: "27",
    slug: "2026-mercedes-benz-gls-450-white-ca",
    year: 2026,
    make: "Mercedes-Benz",
    model: "GLS 450",
    trim: "Base",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Polar White",
    interior: "Black",
    dealType: "Lease",
    msrp: 99000,
    sellingPrice: 93000,
    payment: 899,
    dueAtSigning: 3500,
    term: 36,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 59,
    datePosted: "2026-05-06",
    badge: "NEW",
    notes:
      "7-seater. Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household. $699 broker fee is included in the due-at-signing total above.",
    packages: ["7-Seater", "Running Boards"],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/A6ZVqgdvNgOXXRFeSA7pCkZUeruSm8O3Jo2-SqimNwWgcLZQmer8E9O3RCE7dJyYLRpsGp3b_QqnZga4gStJsK5g1UZoPY4y12M87lYgFM1Dyn5-nSLUcd_dGzzsmvKkQ-48RWilI_UmCyBNTMUgDQuJH3-D521OFUJFNwMCHcfduxlv-U6i7ZM1zGpYNhwi/cc_2026MBS631971493_01_640_040.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811",
  },
  {
    id: "28",
    slug: "2026-mercedes-benz-cle53-amg-coupe-blue-ca",
    year: 2026,
    make: "Mercedes-Benz",
    model: "CLE 53 AMG Coupe",
    trim: "4MATIC",
    bodyStyle: "Coupe",
    fuel: "Gas",
    exterior: "Starling Blue",
    interior: "Black",
    dealType: "Lease",
    msrp: 91000,
    sellingPrice: 86000,
    payment: 859,
    dueAtSigning: 3500,
    term: 24,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 63,
    datePosted: "2026-05-06",
    badge: "HOT",
    notes:
      "Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household. $699 broker fee is included in the due-at-signing total above.",
    packages: ["Pinnacle Trim", "AMG Carbon Fiber", "20\" AMG Y-Design Wheels"],
    images: ["https://pub-2581946c35634f46958be8b522976200.r2.dev/2026-Mercedes-Benz-CLE-AMG-CLE-53-4MATIC+-Coupe-PSRQ-Starling-Blue-Metallic-970.webp"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811",
  },
  {
    id: "29",
    slug: "2026-porsche-cayenne-black-ca",
    year: 2026,
    make: "Porsche",
    model: "Cayenne",
    trim: "Base",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Black",
    interior: "Black",
    dealType: "Lease",
    msrp: 104000,
    sellingPrice: 98000,
    payment: 1179,
    dueAtSigning: 3500,
    term: 39,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 56,
    datePosted: "2026-07-03",
    badge: "NEW",
    notes:
      "Payment is +tax. $699 broker fee is included in the due-at-signing total above.",
    packages: ["21\" RS Spyder Design Wheels", "Bose Surround Sound"],
    images: ["https://vehicle-images.carscommerce.inc/stock-images/chrome/a0d9861200321d9920b42359c78f8bfc.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167",
  },
  {
    id: "30",
    slug: "2026-porsche-panamera-ca",
    year: 2026,
    make: "Porsche",
    model: "Panamera",
    trim: "Base",
    bodyStyle: "Sedan",
    fuel: "Gas",
    exterior: "Provence",
    interior: "Black",
    dealType: "Lease",
    msrp: 130000,
    sellingPrice: 122000,
    payment: 1599,
    dueAtSigning: 4000,
    term: 39,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 52,
    datePosted: "2026-07-03",
    badge: "NEW",
    notes:
      "Payment is +tax. $699 broker fee is included in the due-at-signing total above.",
    packages: [],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/OO0oYT4gvcinee8qh7E42h-JRo4qfmVAaV4u0bRIt5H9NdFIRA_JHTqOW6nLSUwdAosD5_nMkAYeLxNVEhd8LxLiR5k7hZqmle9E6kBQtEX3E6ZoDBlJeoah8LUTmAo_8ldIiEqqfSMmgvPf2eHXNzmJ2SQU-XlKMIJoKggQ338/cc_2026PRC101979607_01_640_A1.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167",
  },
  {
    id: "31",
    slug: "2026-land-rover-range-rover-evoque-blue-ca",
    year: 2026,
    make: "Land Rover",
    model: "Range Rover Evoque",
    trim: "Core S AWD",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Tribeca Blue Metallic",
    interior: "Ebony",
    dealType: "Lease",
    msrp: 57000,
    sellingPrice: 53000,
    payment: 629,
    dueAtSigning: 4000,
    term: 36,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 45,
    datePosted: "2026-07-03",
    badge: "VALUE",
    notes:
      "Payment is +tax. Requires a qualifying conquest incentive — confirm current eligibility with broker. $599 broker fee is included in the due-at-signing total above.",
    packages: [],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/5MUaBu0KmqADayDAt3BDFnHAPcBgxUUaIsCkkCrbiTHFtfZP1Er8jO2H1GyaMIWI-SbVlyzquVsh8krJ4Ocxmg9ikphqTy_brq6gxmRfjOwVWlri4pIiaw8GCWj5KTT42AOBQgFPkCxOlFlXCvN0bkI4uzdWgrF4lAbTQPO3wfY/cc_2026LRS101942839_01_640_1FV.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167",
  },
  {
    id: "32",
    slug: "2026-land-rover-range-rover-velar-p250-ca",
    year: 2026,
    make: "Land Rover",
    model: "Range Rover Velar",
    trim: "P250 S",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Santorini Black Metallic",
    interior: "Ebony",
    dealType: "Lease",
    msrp: 71000,
    sellingPrice: 67000,
    payment: 714,
    dueAtSigning: 4000,
    term: 36,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 43,
    datePosted: "2026-07-03",
    badge: "NEW",
    notes:
      "Payment is +tax. Requires a qualifying conquest incentive — confirm current eligibility with broker. $599 broker fee is included in the due-at-signing total above.",
    packages: [],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/5MUaBu0KmqAD5cudKFDps7olY_R1WkPc0y1uUTvcJvN6lmeRdckDtxH8BlKBDTAa90wFRLknVcB18lBFIeuciuPLA9FHIn9gyfXOL5mDUfSaxIm-8fG0C-srxUfwE7iAfq0tBDiGWxTkexd14FoiYA4CEWBC89S8WY3UTJ5WGfF1GLvEy1BL3g/cc_2026LRS122044623_01_640_1EH.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167",
  },
  {
    id: "33",
    slug: "2026-land-rover-defender-110-gray-ca",
    year: 2026,
    make: "Land Rover",
    model: "Defender 110",
    trim: "P400 X-Dynamic SE",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Borasco Grey Metallic",
    interior: "Ebony",
    dealType: "Lease",
    msrp: 94000,
    sellingPrice: 88000,
    payment: 1069,
    dueAtSigning: 4000,
    term: 36,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 60,
    datePosted: "2026-07-03",
    badge: "HOT",
    notes:
      "Interior trim not specified by broker; shown as manufacturer-standard Ebony — confirm exact spec before signing. Also available in Black, Dark Grey, and Light Grey. Payment is +tax. Requires a qualifying conquest incentive — confirm current eligibility with broker. $599 broker fee is included in the due-at-signing total above.",
    packages: [],
    images: ["https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/5MUaBu0KmqAT6MZYXbuUmh24enC1a7JKB8ftzqK6q6xsG3rHct4EW6fSeGp_9mVCjSkzAUUenQXk4zxXjPEitFbtRn4vhZ7O7ChfsmxBUXmVryYbUgaEH-XhfvfRwc0AM3yb4RzrbSKgv14dJhD2lgG7yptJYd9Zmuq3arTr_Fk/cc_2026LRS132046010_01_640_1CN.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167",
  },
  {
    id: "34",
    slug: "2023-bentley-bentayga-ewb-v8-ca",
    year: 2023,
    make: "Bentley",
    model: "Bentayga EWB",
    trim: "V8",
    bodyStyle: "SUV",
    fuel: "Gas",
    exterior: "Onyx",
    interior: "Linen",
    dealType: "Lease",
    msrp: 285000, // estimated — CPO/pre-owned unit, see note below
    sellingPrice: 260000,
    payment: 1675,
    dueAtSigning: 10000,
    term: 24,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 71,
    datePosted: "2026-07-07",
    badge: "HOT",
    notes:
      "Extended wheelbase V8. Payment is +tax. $1,299 broker fee is included in the due-at-signing total above.",
    packages: [],
    images: ["https://static.tcimg.net/vehicles/primary/f3f14dd92d0777c7/2023-Bentley-Bentayga-gray-full_color-driver_side_profile.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167",
  },
  {
    id: "35",
    slug: "2026-lamborghini-urus-se-demo-ca",
    year: 2026,
    make: "Lamborghini",
    model: "Urus SE",
    trim: "Demo",
    bodyStyle: "SUV",
    fuel: "PHEV",
    exterior: "Blu Cepheus",
    interior: "Black w/ Orange Stitching",
    dealType: "Lease",
    msrp: 342000, // broker-listed vehicle value — see note below
    sellingPrice: 328000, // estimated — see note below
    payment: 0,
    dueAtSigning: 55999,
    term: 12,
    milesPerYear: 7500,
    apr: null,
    sellerType: "Broker",
    sellerName: "Chrome Stallions",
    sellerPhone: "949-763-5609",
    sellerEmail: "sales@chromestallions.com",
    city: "Los Angeles",
    state: "CA",
    verified: true,
    inStock: true,
    popularity: 74,
    datePosted: "2026-07-09",
    badge: "HOT",
    onePay: true,
    notes:
      "One-pay lease — the full $55,999 (7.75% effective rate) is paid upfront and covers the entire 12-month term with no separate monthly bill. Demo unit; broker notes an incoming unit is expected any day. $999 broker fee is included in the one-pay total above. Photo shown is the factory Urus SE in stock trim — exact color match not available; confirm current color with broker.",
    packages: [],
    images: ["https://www.lamborghini.com/sites/it-en/files/DAM/lamborghini/0_facelift_2025/gateway_family/urus/Urus%20SE%20Performante-modelChooser-mobile_v2.png"],
    sourceUrl:
      "https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167",
  },
];

// -----------------------------------------------------------------------------
// Derived filter option lists (auto-generated from the data above)
// -----------------------------------------------------------------------------
export const MAKES = ["All", ...Array.from(new Set(deals.map((d) => d.make))).sort()];
export const SELLERS = ["All", ...Array.from(new Set(deals.map((d) => d.sellerName))).sort()];
export const BODY_STYLES: BodyStyle[] = [
  "Sedan",
  "SUV",
  "Truck",
  "Coupe",
  "Minivan",
  "Hatchback",
];
export const STATES = ["All", ...Array.from(new Set(deals.map((d) => d.state))).sort()];
export const FUEL_TYPES: FuelType[] = ["Gas", "Hybrid", "PHEV", "EV"];
export const TERMS = ["All", ...Array.from(new Set(deals.map((d) => String(d.term)))).sort(
  (a, b) => Number(a) - Number(b)
)];
export const MILEAGE_OPTIONS = [
  "All",
  ...Array.from(
    new Set(deals.filter((d) => d.milesPerYear != null).map((d) => String(d.milesPerYear)))
  ).sort((a, b) => Number(a) - Number(b)),
];

export function getDealBySlug(slug: string): Deal | undefined {
  return deals.find((d) => d.slug === slug);
}

export function getSimilarDeals(deal: Deal, count = 3): Deal[] {
  return deals
    .filter((d) => d.id !== deal.id)
    .map((d) => {
      let score = 0;
      if (d.make === deal.make) score += 2;
      if (d.bodyStyle === deal.bodyStyle) score += 2;
      if (d.fuel === deal.fuel) score += 1;
      if (d.state === deal.state) score += 1;
      return { deal: d, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.deal);
}
