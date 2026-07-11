import type { Deal } from "./deals-data";

export function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function dealTitle(deal: Deal): string {
  return `${deal.year} ${deal.make} ${deal.model} ${deal.trim}`;
}

// Effective monthly cost = spreads due-at-signing across the term so deals
// with different upfront amounts can be compared fairly.
export function effectiveMonthly(deal: Deal): number {
  return (deal.payment * deal.term + deal.dueAtSigning) / deal.term;
}

export function msrpDiscountPercent(deal: Deal): number {
  if (deal.msrp <= 0) return 0;
  return ((deal.msrp - deal.sellingPrice) / deal.msrp) * 100;
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

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
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
  return `mailto:support@autospacedeals.example?subject=${subject}&body=${body}`;
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
      return list.sort((a, b) => a.payment - b.payment);
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
