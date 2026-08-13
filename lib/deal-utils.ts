import type { Deal } from "./deals-data";

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
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

// Renders MSRP respecting a listing's mask_msrp setting.
export function displayMsrp(deal: Deal): string {
  return deal.maskMsrp ? maskedCurrency(deal.msrp) : formatCurrency(deal.msrp);
}

// Effective monthly cost = spreads due-at-signing across the term so deals
// with different upfront amounts can be compared fairly.
export function effectiveMonthly(deal: Deal): number {
  return (deal.payment * deal.term + deal.dueAtSigning) / deal.term;
}

export function msrpDiscountPercent(deal: Deal): number {
  if (deal.msrp <= 0 || deal.sellingPrice == null) return 0;
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
  const diff = today.getTime() - posted.getTime();
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

export function relativeDatePosted(dateStr: string, today?: Date): string {
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
    `Hi ${deal.sellerName},\n\nI found this deal on AutoSpace Deals and would like more information:\n\n${dealTitle(
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
  return `mailto:mheryanrobert@gmail.com?subject=${subject}&body=${body}`;
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
  inStockOnly: boolean;
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
  inStockOnly: false,
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
  | "popular"
  | "closest";

export const SORT_LABELS: Record<SortOption, string> = {
  featured: "Featured",
  paymentLow: "Lowest monthly payment",
  dueLow: "Lowest due at signing",
  effectiveLow: "Best effective monthly cost",
  newest: "Newest deals",
  discountHigh: "Highest MSRP discount",
  popular: "Most popular",
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
    const matchesStock = !filters.inStockOnly || deal.inStock;
    const matchesPayment = deal.payment <= filters.maxPayment;
    const matchesDueAtSigning = deal.dueAtSigning <= filters.maxDueAtSigning;

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
      matchesStock &&
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
    case "popular":
      return list.sort((a, b) => b.popularity - a.popularity);
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
