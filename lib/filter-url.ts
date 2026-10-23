// The homepage's filters and sort in its address, so a search can be linked
// to (an ad can land on idriveus.com/?make=bmw already filtered) and the
// browser's back button returns to it. Readable keys and values:
//
//   /?make=bmw&model=x5&body=suv&fuel=ev&max=600&due=3000&term=36&sort=paymentLow
//
// Values are matched loosely ("mercedes-benz", "Mercedes Benz") against the
// deals on the page, and anything unknown is dropped, so an old or mistyped
// link just shows more deals instead of an empty page.
import { DEFAULT_FILTERS, MAX_DAS_CEILING, MAX_PAYMENT_CEILING, SORT_LABELS, type DealFilters, type SortOption } from "@/lib/deal-utils";
import type { Deal } from "@/lib/deals-data";

type Params = { get(key: string): string | null };

const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// How a make, model or other option is written in the address: "Mercedes-Benz" -> "mercedes-benz".
export const urlValue = slug;

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUELS = ["Gas", "Hybrid", "PHEV", "EV"];
const PAYMENT_TYPES: Record<string, string> = { monthly: "Monthly", "one-pay": "One-pay" };

// The URL key for each filter, in the order they're written.
const KEYS = {
  query: "q",
  make: "make",
  model: "model",
  trim: "trim",
  bodyStyle: "body",
  fuel: "fuel",
  seller: "seller",
  state: "state",
  term: "term",
  mileage: "miles",
  paymentType: "type",
  maxPayment: "max",
  maxDueAtSigning: "due",
} as const satisfies Record<keyof DealFilters, string>;

export const FILTER_URL_KEYS: string[] = [...Object.values(KEYS), "sort"];

// The filters and sort as URL params; defaults are left out.
export function filtersToParams(filters: DealFilters, sortBy: SortOption): [string, string][] {
  const out: [string, string][] = [];
  for (const [field, key] of Object.entries(KEYS) as [keyof DealFilters, string][]) {
    const value = filters[field];
    if (value === DEFAULT_FILTERS[field]) continue;
    if (field === "query") {
      if (String(value).trim()) out.push([key, String(value).trim()]);
    } else if (typeof value === "number") out.push([key, String(value)]);
    else out.push([key, field === "state" || field === "term" || field === "mileage" ? String(value) : slug(String(value))]);
  }
  if (sortBy !== "featured") out.push(["sort", sortBy]);
  return out;
}

// Reads a URL's filters and sort back, against the deals on the page.
export function filtersFromParams(params: Params, deals: Deal[]): { filters: DealFilters; sortBy: SortOption } {
  const filters: DealFilters = { ...DEFAULT_FILTERS };
  const pick = (key: string, options: Iterable<string | null | undefined>) => {
    const wanted = slug(params.get(key) ?? "");
    if (!wanted) return null;
    for (const option of options) if (option && slug(option) === wanted) return option;
    return null;
  };
  const wholeNumber = (key: string, max: number) => {
    const raw = params.get(key);
    if (!raw || !/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return n <= max ? n : null;
  };

  const q = params.get(KEYS.query)?.trim();
  if (q) filters.query = q.slice(0, 80);
  const make = pick(KEYS.make, new Set(deals.map((d) => d.make)));
  if (make) filters.make = make;
  const sameMake = make ? deals.filter((d) => d.make === make) : deals;
  const model = pick(KEYS.model, new Set(sameMake.map((d) => d.model)));
  if (model) {
    filters.model = model;
    const trim = pick(KEYS.trim, new Set(sameMake.filter((d) => d.model === model).map((d) => d.trim)));
    if (trim) filters.trim = trim;
  }
  const body = pick(KEYS.bodyStyle, BODY_STYLES);
  if (body) filters.bodyStyle = body;
  const fuel = pick(KEYS.fuel, FUELS);
  if (fuel) filters.fuel = fuel;
  const seller = pick(KEYS.seller, new Set(deals.map((d) => d.sellerName)));
  if (seller) filters.seller = seller;
  const state = pick(KEYS.state, new Set(deals.map((d) => d.state)));
  if (state) filters.state = state;
  const term = wholeNumber(KEYS.term, 120);
  if (term) filters.term = String(term);
  const miles = wholeNumber(KEYS.mileage, 100000);
  if (miles) filters.mileage = String(miles);
  const type = PAYMENT_TYPES[slug(params.get(KEYS.paymentType) ?? "")];
  if (type) filters.paymentType = type;
  const max = wholeNumber(KEYS.maxPayment, MAX_PAYMENT_CEILING);
  if (max !== null) filters.maxPayment = max;
  const due = wholeNumber(KEYS.maxDueAtSigning, MAX_DAS_CEILING);
  if (due !== null) filters.maxDueAtSigning = due;

  const sort = params.get("sort");
  const sortBy = sort && sort in SORT_LABELS ? (sort as SortOption) : "featured";
  return { filters, sortBy };
}
