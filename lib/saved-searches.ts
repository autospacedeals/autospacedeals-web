// Client-safe helpers for saved searches + email alerts (see
// supabase/migrations/0017_saved_searches.sql): validating a stored or
// submitted filter object, and describing one in words. Shared by the
// homepage's "Save this search" button (a Client Component), the server
// action that stores it, the dashboard list, and the hourly alert job. The
// Supabase reads and writes live in lib/supabase/saved-searches.ts, which is
// server-only, so nothing here may import it.
import {
  DEFAULT_FILTERS,
  MAX_DAS_CEILING,
  MAX_PAYMENT_CEILING,
  formatCurrency,
  type DealFilters,
} from "./deal-utils";

// Matches the check on saved_searches.label (0017).
export const SAVED_SEARCH_LABEL_MAX = 200;

// Matches the per-customer cap in the 0017 insert trigger.
export const SAVED_SEARCHES_PER_CUSTOMER = 25;

// Remembers the filters a signed-out shopper tried to save, so that after
// logging in (which reloads the homepage from scratch) their filters are
// back and they only have to press Save again. Written by SaveSearchButton,
// read once and cleared by HomeClient.
export const PENDING_SAVED_SEARCH_KEY = "asd_pending_saved_search_v1";

// Where "Manage alerts" links point from outside the dashboard (alert
// emails, the unsubscribe page): the login page, which sends a signed-in
// customer straight on and anyone else there after logging in — linking to
// the dashboard directly would lose the #alerts anchor on its redirect to
// login.
export const MANAGE_ALERTS_PATH = `/customer/login?next=${encodeURIComponent("/customer/dashboard#alerts")}`;

// Same bounds as the site's own inputs: the search box is free text (the
// homepage's search input has this as its maxLength), the dropdown values
// come from listing data.
export const SAVED_SEARCH_QUERY_MAX = 100;
const OPTION_MAX = 80;

const BODY_STYLES = ["Sedan", "SUV", "Truck", "Coupe", "Minivan", "Hatchback"];
const FUEL_TYPES = ["Gas", "Hybrid", "PHEV", "EV"];
const PAYMENT_TYPES = ["All", "Monthly", "One-pay"];

// Free-text values: a bounded string with no control characters. Anything
// else is rejected rather than cleaned up, since it can't have come from
// the site's own filter panel.
function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max) return null;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return null;
  }
  return value;
}

function oneOf(value: unknown, allowed: string[]): string | null {
  return typeof value === "string" && (value === "All" || allowed.includes(value)) ? value : null;
}

// "All", or a whole number written as digits (lease term in months, miles
// per year) — the filter compares it as a string.
function digitsOrAll(value: unknown, maxDigits: number): string | null {
  if (value === "All") return "All";
  return typeof value === "string" && new RegExp(`^[1-9][0-9]{0,${maxDigits - 1}}$`).test(value)
    ? value
    : null;
}

function wholeNumberInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
    ? value
    : null;
}

// Turns an untrusted object (a server action argument, or a row read back
// from the database) into a complete DealFilters. Only the known keys are
// read — anything else is dropped — and a missing key takes its default.
// Returns null if any known key has the wrong type or is out of bounds.
export function parseSavedSearchFilters(raw: unknown): DealFilters | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const pick = <K extends keyof DealFilters>(key: K) =>
    Object.prototype.hasOwnProperty.call(input, key) ? input[key] : DEFAULT_FILTERS[key];

  const filters: { [K in keyof DealFilters]: DealFilters[K] | null } = {
    query: boundedText(pick("query"), SAVED_SEARCH_QUERY_MAX),
    make: boundedText(pick("make"), OPTION_MAX),
    model: boundedText(pick("model"), OPTION_MAX),
    bodyStyle: oneOf(pick("bodyStyle"), BODY_STYLES),
    fuel: oneOf(pick("fuel"), FUEL_TYPES),
    seller: boundedText(pick("seller"), OPTION_MAX),
    state: boundedText(pick("state"), OPTION_MAX),
    term: digitsOrAll(pick("term"), 3),
    mileage: digitsOrAll(pick("mileage"), 6),
    paymentType: oneOf(pick("paymentType"), PAYMENT_TYPES),
    maxPayment: wholeNumberInRange(pick("maxPayment"), 0, MAX_PAYMENT_CEILING),
    maxDueAtSigning: wholeNumberInRange(pick("maxDueAtSigning"), 0, MAX_DAS_CEILING),
  };

  for (const value of Object.values(filters)) {
    if (value === null) return null;
  }
  const valid = filters as DealFilters;
  // An empty dropdown value means nothing, and would never match a deal.
  for (const key of ["make", "model", "seller", "state"] as const) {
    if (!valid[key].trim()) return null;
  }
  return valid;
}

// True when the filters narrow the list at all — saving the unfiltered
// list would email every new deal on the site. Whitespace-only search text
// doesn't count (the filter ignores it too).
export function hasActiveFilters(filters: DealFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.make !== DEFAULT_FILTERS.make ||
    filters.model !== DEFAULT_FILTERS.model ||
    filters.bodyStyle !== DEFAULT_FILTERS.bodyStyle ||
    filters.fuel !== DEFAULT_FILTERS.fuel ||
    filters.seller !== DEFAULT_FILTERS.seller ||
    filters.state !== DEFAULT_FILTERS.state ||
    filters.term !== DEFAULT_FILTERS.term ||
    filters.mileage !== DEFAULT_FILTERS.mileage ||
    filters.paymentType !== DEFAULT_FILTERS.paymentType ||
    filters.maxPayment < MAX_PAYMENT_CEILING ||
    filters.maxDueAtSigning < MAX_DAS_CEILING
  );
}

// A stable string for "is this the same search?" — key order fixed, and
// search text compared the way the filter compares it.
export function savedSearchKey(filters: DealFilters): string {
  const normalized: DealFilters = {
    ...filters,
    query: filters.query.trim().toLowerCase(),
    maxPayment: Math.min(filters.maxPayment, MAX_PAYMENT_CEILING),
    maxDueAtSigning: Math.min(filters.maxDueAtSigning, MAX_DAS_CEILING),
  };
  return JSON.stringify(
    (Object.keys(DEFAULT_FILTERS) as (keyof DealFilters)[]).map((key) => normalized[key])
  );
}

export interface FilterSummaryItem {
  name: string;
  value: string;
}

// Every active filter as a name/value pair ("Body style: SUV"), in the
// filter panel's order — the dashboard's detail line.
export function describeFilters(filters: DealFilters): FilterSummaryItem[] {
  const items: FilterSummaryItem[] = [];
  const query = filters.query.trim();
  if (query) items.push({ name: "Search", value: `“${query}”` });
  if (filters.make !== "All") items.push({ name: "Make", value: filters.make });
  if (filters.model !== "All") items.push({ name: "Model", value: filters.model });
  if (filters.bodyStyle !== "All") items.push({ name: "Body style", value: filters.bodyStyle });
  if (filters.seller !== "All") items.push({ name: "Broker/dealer", value: filters.seller });
  if (filters.state !== "All") items.push({ name: "Location", value: filters.state });
  if (filters.term !== "All") items.push({ name: "Lease term", value: `${filters.term} mo` });
  if (filters.paymentType !== "All") items.push({ name: "Lease type", value: filters.paymentType });
  if (filters.fuel !== "All") items.push({ name: "Fuel type", value: filters.fuel });
  if (filters.mileage !== "All") {
    items.push({ name: "Mileage allowance", value: `${Number(filters.mileage).toLocaleString("en-US")}/yr` });
  }
  if (filters.maxPayment < MAX_PAYMENT_CEILING) {
    items.push({ name: "Max monthly payment", value: `${formatCurrency(filters.maxPayment)}/mo` });
  }
  if (filters.maxDueAtSigning < MAX_DAS_CEILING) {
    items.push({ name: "Max due at signing", value: formatCurrency(filters.maxDueAtSigning) });
  }
  return items;
}

// The short auto-generated name, e.g. "SUV · Under $600/mo · CA". Built on
// the server from validated filters (never taken from the request) and
// capped to the column's limit.
export function savedSearchLabel(filters: DealFilters): string {
  const parts: string[] = [];
  const query = filters.query.trim();
  if (query) parts.push(`“${query}”`);
  const vehicle = [filters.make, filters.model].filter((v) => v !== "All").join(" ");
  if (vehicle) parts.push(vehicle);
  if (filters.bodyStyle !== "All") parts.push(filters.bodyStyle);
  if (filters.fuel !== "All") parts.push(filters.fuel);
  if (filters.paymentType === "One-pay") parts.push("One-pay");
  else if (filters.paymentType === "Monthly") parts.push("Monthly");
  if (filters.maxPayment < MAX_PAYMENT_CEILING) parts.push(`Under ${formatCurrency(filters.maxPayment)}/mo`);
  if (filters.maxDueAtSigning < MAX_DAS_CEILING) {
    parts.push(`Up to ${formatCurrency(filters.maxDueAtSigning)} due at signing`);
  }
  if (filters.term !== "All") parts.push(`${filters.term} mo`);
  if (filters.mileage !== "All") parts.push(`${Number(filters.mileage).toLocaleString("en-US")} mi/yr`);
  if (filters.seller !== "All") parts.push(filters.seller);
  if (filters.state !== "All") parts.push(filters.state);

  const label = parts.join(" · ") || "All deals";
  return label.length > SAVED_SEARCH_LABEL_MAX
    ? `${label.slice(0, SAVED_SEARCH_LABEL_MAX - 1).trimEnd()}…`
    : label;
}

// "Sep 3, 2026" in California time (where the marketplace is) rather than
// the server's UTC. Empty for a missing or unreadable timestamp.
export function savedSearchDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
}
