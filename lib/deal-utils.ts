import type { Deal } from "./deals-data";

// Defensive against bad/missing data: the type says `number`, but a value
// coming from the database (or a row that slipped through with a null in a
// column TypeScript assumes is always populated) can arrive as null,
// undefined, or NaN at runtime — calling .toLocaleString() on that throws
// and, since this function is used everywhere a dollar amount is shown,
// took down entire pages for any listing with one bad numeric field.
export function formatCurrency(amount: number): string {
  const safe = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return safe.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function dealTitle(deal: Deal): string {
  return [deal.year, deal.make, deal.model, deal.trim].filter(Boolean).join(" ");
}

// Some brokers prefer not to publish the exact MSRP — masks the last few
// digits with X's (e.g. "$49,XXX") while keeping the formatted $ and comma
// styling intact, so it still reads naturally next to a real dollar amount.
export function maskedCurrency(amount: number, maskDigits: number = 3): string {
  const chars = formatCurrency(amount).split("");
  let remaining = maskDigits;
  for (let i = chars.length - 1; i >= 0 && remaining > 0; i--) {
    if (/\d/.test(chars[i])) {
      chars[i] = "X";
      remaining--;
    }
  }
  return chars.join("");
}

// Renders MSRP respecting a listing's mask_msrp setting. Prefers the
// broker's literal masked text (e.g. "$54,XXX") when present; falls back
// to auto-masking the last 3 digits of the real number for older masked
// listings saved before msrpMaskedLabel existed.
export function displayMsrp(deal: Deal): string {
  if (deal.maskMsrp && deal.msrpMaskedLabel) return deal.msrpMaskedLabel;
  return deal.maskMsrp ? maskedCurrency(deal.msrp) : formatCurrency(deal.msrp);
}

// Formats a leading-digits + trailing-X's combo into "$54,XXX" style,
// matching formatCurrency's comma grouping so a masked MSRP lines up
// visually with a real one.
function formatMaskedDigits(leadingDigits: string, xCount: number): string {
  const full = leadingDigits + "X".repeat(xCount);
  let grouped = "";
  let count = 0;
  for (let i = full.length - 1; i >= 0; i--) {
    grouped = full[i] + grouped;
    count++;
    if (count % 3 === 0 && i !== 0) grouped = "," + grouped;
  }
  return `$${grouped}`;
}

// Parses whatever a broker types into the MSRP field. Plain digits work
// as before. Typing any x/X switches to "masked" mode: the exact number
// is never computed or stored, only what was actually typed (e.g.
// "54,xxx" -> a 54000 estimate for internal sorting/discount math, and
// the literal label "$54,XXX" for display) — so there's no real MSRP
// anywhere in the page's data for a sniper to read from devtools, unlike
// the old approach of always storing the true number and masking only
// at render time.
export function parseMsrpInput(raw: string): {
  msrp: number;
  maskMsrp: boolean;
  msrpMaskedLabel: string | null;
} {
  const trimmed = (raw ?? "").trim();
  if (!/x/i.test(trimmed)) {
    const num = Number(trimmed.replace(/[^0-9.]/g, ""));
    return { msrp: Number.isFinite(num) ? num : 0, maskMsrp: false, msrpMaskedLabel: null };
  }
  const digitsAndX = trimmed.replace(/[^0-9xX]/g, "");
  const leadingDigits = digitsAndX.match(/^\d*/)?.[0] ?? "";
  const xCount = digitsAndX.length - leadingDigits.length;
  const estimate = Number(leadingDigits + "0".repeat(xCount)) || 0;
  return {
    msrp: estimate,
    maskMsrp: true,
    msrpMaskedLabel: formatMaskedDigits(leadingDigits, xCount),
  };
}

// What to pre-fill the MSRP input with when a broker reopens a listing
// to edit it — masked listings show the masked text back (so saving
// without touching MSRP doesn't silently reveal or drop the mask),
// unmasked listings show the real number.
export function msrpEditValue(deal: Deal): string {
  if (!deal.maskMsrp) return deal.msrp ? String(deal.msrp) : "";
  const label = deal.msrpMaskedLabel ?? maskedCurrency(deal.msrp);
  return label.replace(/^\$/, "");
}

// Effective monthly cost = spreads due-at-signing across the term so deals
// with different upfront amounts can be compared fairly. Guards against a
// zero/missing term (would otherwise divide by zero) and any non-finite
// inputs, same reasoning as formatCurrency above.
export function effectiveMonthly(deal: Deal): number {
  const payment = Number.isFinite(deal.payment) ? deal.payment : 0;
  const dueAtSigning = Number.isFinite(deal.dueAtSigning) ? deal.dueAtSigning : 0;
  const term = Number.isFinite(deal.term) && deal.term > 0 ? deal.term : 1;
  return (payment * term + dueAtSigning) / term;
}

export function msrpDiscountPercent(deal: Deal): number {
  if (!deal.msrp || deal.msrp <= 0 || deal.sellingPrice == null || !Number.isFinite(deal.sellingPrice)) {
    return 0;
  }
  return ((deal.msrp - deal.sellingPrice) / deal.msrp) * 100;
}

// Rough, estimate-only payment math for the interactive calculator on the
// deal page: extra money put down (or an incentive applied) reduces the
// amount financed, and that reduction is spread evenly across the
// remaining term to lower the monthly payment. This intentionally ignores
// money factor / APR / residual precision — those aren't captured for every
// deal, and the whole point of this tool is a ballpark "what if" a shopper
// can play with, not a finance quote. The UI is required to disclaim this.
export function estimatePayment(
  deal: Deal,
  input: { dueAtSigning: number; incentivesTotal: number }
): { monthly: number; total: number } {
  const term = deal.term > 0 ? deal.term : 1;

  if (deal.onePay) {
    // No monthly bill on a one-pay lease — the "due at signing" figure the
    // shopper edits *is* the total, so incentives (and any adjustment) come
    // straight off that number rather than being amortized anywhere.
    return { monthly: 0, total: Math.max(0, input.dueAtSigning - input.incentivesTotal) };
  }

  // Any difference between the shopper's chosen due-at-signing and the
  // advertised one — plus any selected incentives — is treated as extra (or
  // less) cap cost reduction, spread evenly across the remaining term. So
  // pushing due-at-signing down toward $0 rolls that amount into the
  // monthly payment instead; pushing it up lowers the monthly payment.
  const capReduction = input.dueAtSigning - deal.dueAtSigning + input.incentivesTotal;
  const monthly = Math.max(0, deal.payment - capReduction / term);
  return { monthly, total: Math.max(0, input.dueAtSigning) };
}

export function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysAgo(dateStr: string, today: Date = new Date()): number {
  const posted = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(posted.getTime())) return 0;
  const diff = today.getTime() - posted.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

export function relativeDatePosted(dateStr: string, today?: Date): string {
  if (!dateStr) return "Recently posted";
  const days = daysAgo(dateStr, today);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted 1 day ago";
  if (days < 30) return `Posted ${days} days ago`;
  return `Posted ${formatDate(dateStr)}`;
}

export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function dealMailtoHref(deal: Deal, subjectPrefix = "Interested in"): string {
  const subject = encodeURIComponent(`${subjectPrefix}: ${dealTitle(deal)}`);
  const body = encodeURIComponent(
    `Hi ${deal.sellerName},\n\nI found this deal on Drive and would like more information:\n\n${dealTitle(
      deal
    )}\n${formatCurrency(deal.payment)}/mo, ${formatCurrency(
      deal.dueAtSigning
    )} due at signing, ${deal.term} month ${deal.dealType.toLowerCase()}\n\nIs it still available?\n\nThanks!`
  );
  return `mailto:${deal.sellerEmail}?subject=${subject}&body=${body}`;
}

export function reportIssueMailtoHref(deal: Deal): string {
  const subject = encodeURIComponent(`Report inaccurate deal: ${dealTitle(deal)} (#${deal.id})`);
  const body = encodeURIComponent(
    `Deal: ${dealTitle(deal)}\nListing URL: /deals/${deal.slug}\n\nWhat looks wrong?\n`
  );
  return `mailto:rob@idriveus.com?subject=${subject}&body=${body}`;
}

// Builds a URL-friendly slug from a vehicle's year/make/model/trim/state,
// with a short random suffix so two brokers listing the same car don't
// collide (the `deals.slug` column is unique).
export function slugify(parts: (string | number)[]): string {
  const base = parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

// Like getSimilarDeals in deals-data.ts, but works over any array (needed
// now that the public pages fetch deals from the database instead of the
// static file).
export function getSimilarDealsFrom(allDeals: Deal[], deal: Deal, count = 3): Deal[] {
  return allDeals
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

// -----------------------------------------------------------------------------
// Filtering & sorting
// -----------------------------------------------------------------------------

export interface DealFilters {
  query: string;
  make: string; // "All" or a make
  model: string; // "All" or a model
  bodyStyle: string; // "All" or a BodyStyle
  fuel: string; // "All" or a FuelType
  seller: string; // "All" or an exact sellerName
  state: string; // "All" or a state code (also used as "your location" for the closest sort)
  term: string; // "All" or term in months as string
  mileage: string; // "All" or miles/year as string
  paymentType: string; // "All" | "Monthly" | "One-pay"
  maxPayment: number;
  maxDueAtSigning: number;
}

export const MAX_PAYMENT_CEILING = 2000;
export const MAX_DAS_CEILING = 10000;

export const DEFAULT_FILTERS: DealFilters = {
  query: "",
  make: "All",
  model: "All",
  bodyStyle: "All",
  fuel: "All",
  seller: "All",
  state: "All",
  term: "All",
  mileage: "All",
  paymentType: "All",
  maxPayment: MAX_PAYMENT_CEILING,
  maxDueAtSigning: MAX_DAS_CEILING,
};

export type SortOption =
  | "featured"
  | "paymentLow"
  | "dueLow"
  | "effectiveLow"
  | "newest"
  | "discountHigh"
  | "closest";

export const SORT_LABELS: Record<SortOption, string> = {
  featured: "Featured",
  paymentLow: "Lowest monthly payment",
  dueLow: "Lowest due at signing",
  effectiveLow: "Best effective monthly cost",
  newest: "Newest deals",
  discountHigh: "Highest MSRP discount",
  closest: "Closest to my location",
};

export function filterDeals(deals: Deal[], filters: DealFilters): Deal[] {
  const search = filters.query.trim().toLowerCase();

  return deals.filter((deal) => {
    const matchesMake = filters.make === "All" || deal.make === filters.make;
    const matchesModel = filters.model === "All" || deal.model === filters.model;
    const matchesBodyStyle = filters.bodyStyle === "All" || deal.bodyStyle === filters.bodyStyle;
    const matchesFuel = filters.fuel === "All" || deal.fuel === filters.fuel;
    const matchesSeller = filters.seller === "All" || deal.sellerName === filters.seller;
    const matchesState = filters.state === "All" || deal.state === filters.state;
    const matchesTerm = filters.term === "All" || String(deal.term) === filters.term;
    const matchesMileage =
      filters.mileage === "All" || String(deal.milesPerYear ?? "") === filters.mileage;
    const matchesPaymentType =
      filters.paymentType === "All" ||
      (filters.paymentType === "One-pay" ? deal.onePay : !deal.onePay);
    // The sliders' max position is meant to mean "no limit" (shown as "Any"
    // in the UI — see FilterPanel), but a literal <= comparison against that
    // ceiling was quietly excluding anything priced above it even when the
    // filter was never touched — most visibly a one-pay lease, whose
    // dueAtSigning holds the entire lump sum (easily $100k+ for an exotic),
    // but this could just as easily hide any deal with a genuinely high
    // payment or due-at-signing.
    const matchesPayment =
      filters.maxPayment >= MAX_PAYMENT_CEILING || deal.payment <= filters.maxPayment;
    const matchesDueAtSigning =
      filters.maxDueAtSigning >= MAX_DAS_CEILING || deal.dueAtSigning <= filters.maxDueAtSigning;

    const searchableText = [
      deal.year,
      deal.make,
      deal.model,
      deal.trim,
      deal.state,
      deal.city,
      deal.exterior,
      deal.interior,
      deal.sellerName,
      deal.notes,
      deal.fuel,
      deal.bodyStyle,
      ...(deal.packages || []),
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = search === "" || searchableText.includes(search);

    return (
      matchesMake &&
      matchesModel &&
      matchesBodyStyle &&
      matchesFuel &&
      matchesSeller &&
      matchesState &&
      matchesTerm &&
      matchesMileage &&
      matchesPaymentType &&
      matchesPayment &&
      matchesDueAtSigning &&
      matchesQuery
    );
  });
}

export function sortDeals(deals: Deal[], sortBy: SortOption, referenceState: string): Deal[] {
  const list = [...deals];

  switch (sortBy) {
    case "paymentLow":
      // One-pay deals have no real monthly payment (payment is 0 by convention),
      // so sort those by their effective monthly cost instead of the raw field —
      // otherwise a $55k one-pay lease would falsely rank as "cheapest".
      return list.sort(
        (a, b) => (a.onePay ? effectiveMonthly(a) : a.payment) - (b.onePay ? effectiveMonthly(b) : b.payment)
      );
    case "dueLow":
      return list.sort((a, b) => a.dueAtSigning - b.dueAtSigning);
    case "effectiveLow":
      return list.sort((a, b) => effectiveMonthly(a) - effectiveMonthly(b));
    case "newest":
      return list.sort((a, b) => (a.datePosted < b.datePosted ? 1 : -1));
    case "discountHigh":
      return list.sort((a, b) => msrpDiscountPercent(b) - msrpDiscountPercent(a));
    case "closest":
      if (referenceState === "All") return list;
      return list.sort((a, b) => {
        const aMatch = a.state === referenceState ? 0 : 1;
        const bMatch = b.state === referenceState ? 0 : 1;
        return aMatch - bMatch;
      });
    case "featured":
    default:
      return list.sort((a, b) => b.popularity - a.popularity);
  }
}
