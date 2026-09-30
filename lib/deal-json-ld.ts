// =============================================================================
// Deal structured data (JSON-LD)
// =============================================================================
// Builds the schema.org `Car` + lease `Offer` block rendered server-side on
// app/deals/[slug]/page.tsx, so search engines and AI tools can read the
// vehicle, the monthly price and the seller without scraping the page.
//
// Every field is optional in practice (a broker may leave trim, color, body
// style, etc. blank, and older rows can hold odd values), so each one is
// checked before it's added: empty strings, null/undefined, NaN and
// non-positive numbers (except a genuine $0 due at signing) are simply left
// out rather than emitted.
// =============================================================================

import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency } from "@/lib/deal-utils";
import { PLACEHOLDER_IMAGE } from "@/lib/supabase/deals";
import { SITE_URL } from "@/lib/site";

type JsonLd = { [key: string]: JsonLdValue };
type JsonLdValue = string | number | boolean | JsonLd | JsonLdValue[];

const GOODRELATIONS = "http://purl.org/goodrelations/v1#";

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

// Drops keys whose value is undefined, an empty array or an empty object, so
// optional fields vanish from the output instead of serializing as null or {}
// (JSON.stringify would drop undefined too, but this keeps "never emit an
// empty field" explicit).
function compact(obj: Record<string, JsonLdValue | undefined>): JsonLd {
  const out: JsonLd = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

// Listing photos are stored either as absolute URLs (Supabase storage,
// CarsXE) or as site-relative paths (/cars/...). Structured data needs
// absolute URLs, so relative ones are resolved against SITE_URL. The generic
// placeholder isn't a photo of the car, so it's left out.
function absoluteImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const raw of images) {
    const src = text(raw);
    if (!src || src === PLACEHOLDER_IMAGE) continue;
    try {
      const url = new URL(src, SITE_URL);
      if (url.protocol === "https:" || url.protocol === "http:") out.push(url.toString());
    } catch {
      // Unparseable path — skip just this image.
    }
  }
  return out;
}

const FUEL_LABELS: Record<string, string> = {
  Gas: "Gasoline",
  Hybrid: "Hybrid",
  PHEV: "Plug-in hybrid",
  EV: "Electric",
};

function itemCondition(condition: Deal["condition"]): string | undefined {
  if (condition === "New") return "https://schema.org/NewCondition";
  if (condition === "Used" || condition === "CPO") return "https://schema.org/UsedCondition";
  return undefined;
}

// Brokers sell on behalf of many dealers, so they're a plain Organization. A
// dealership salesperson sells for their dealership, so that listing's
// seller is an AutoDealer (named after the dealership when we know it).
function seller(deal: Deal): JsonLd | undefined {
  const sellerType = text(deal.sellerType) ?? "";
  const dealership = text(deal.sellerDealership);
  const isDealer =
    sellerType === "Salesperson" || /dealer/i.test(sellerType) || dealership !== undefined;
  const name = (isDealer && dealership) || text(deal.sellerName);
  if (!name) return undefined;

  const locality = text(deal.city);
  const region = text(deal.state);
  const address =
    locality || region
      ? compact({
          "@type": "PostalAddress",
          addressLocality: locality,
          addressRegion: region,
          addressCountry: "US",
        })
      : undefined;

  return compact({
    "@type": isDealer ? "AutoDealer" : "Organization",
    name,
    address,
  });
}

function offer(deal: Deal, url: string): JsonLd | undefined {
  const isFinance = deal.dealType === "Finance";
  const term = positiveNumber(deal.term);
  // $0 due at signing is a real (and selling-point) value on a lease, so
  // it's kept; only a one-pay total must be positive to count as a price.
  const dueAtSigning = nonNegativeNumber(deal.dueAtSigning);
  const milesPerYear = positiveNumber(deal.milesPerYear);
  const apr = positiveNumber(deal.apr);

  let price: number | undefined;
  let priceSpecification: JsonLd | undefined;
  const details: string[] = [];

  if (deal.onePay) {
    // One-pay lease: a single upfront amount covers the whole term, stored
    // in dueAtSigning (payment is 0 by convention).
    price = positiveNumber(dueAtSigning);
    if (price !== undefined) {
      details.push(`${formatCurrency(price)} one-pay (single upfront payment)`);
    }
    if (term) details.push(`${term}-month lease`);
  } else {
    price = positiveNumber(deal.payment);
    if (price !== undefined) {
      priceSpecification = compact({
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: "USD",
        unitCode: "MON",
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
        billingDuration: term
          ? { "@type": "QuantitativeValue", value: term, unitCode: "MON" }
          : undefined,
      });
    }
    if (dueAtSigning !== undefined) {
      details.push(`${formatCurrency(dueAtSigning)} ${isFinance ? "down" : "due at signing"}`);
    }
    if (term) details.push(`${term}-month ${isFinance ? "finance" : "lease"}`);
    if (isFinance && apr) details.push(`${apr}% APR`);
  }
  if (!isFinance && milesPerYear) {
    details.push(`${milesPerYear.toLocaleString("en-US")} miles per year`);
  }
  if (!isFinance && deal.msdCount) {
    details.push(
      `assumes ${deal.msdCount} multiple security deposit${deal.msdCount === 1 ? "" : "s"}` +
        (deal.msdTotal ? ` ($${Number(deal.msdTotal).toLocaleString("en-US")} refundable)` : "")
    );
  }

  // Without a price there's no meaningful offer to describe.
  if (price === undefined) return undefined;

  return compact({
    "@type": "Offer",
    url,
    // A finance deal is a sale on payments, not a lease.
    businessFunction: `${GOODRELATIONS}${isFinance ? "Sell" : "LeaseOut"}`,
    price,
    priceCurrency: "USD",
    priceSpecification,
    description: details.length > 0 ? details.join(", ") : undefined,
    availability: deal.inStock
      ? "https://schema.org/InStock"
      : "https://schema.org/LimitedAvailability",
    seller: seller(deal),
    areaServed: text(deal.state),
  });
}

// Returns null when the deal can't be described (e.g. a sample listing, or
// missing the basics). Never throws — any unexpected bad field is logged and
// the page simply renders without structured data.
export function buildDealJsonLd(deal: Deal): JsonLd | null {
  try {
    // Sample listings are illustrative placeholders, not real offers —
    // advertising them to search engines as in-stock leases would mislead.
    if (deal.sample) return null;

    const make = text(deal.make);
    const model = text(deal.model);
    const slug = text(deal.slug);
    if (!make || !model || !slug) return null;

    const name = text(dealTitle(deal));
    const url = `${SITE_URL}/deals/${encodeURIComponent(slug)}`;
    const year =
      typeof deal.year === "number" && Number.isInteger(deal.year) && deal.year > 1900
        ? String(deal.year)
        : undefined;

    return compact({
      "@context": "https://schema.org",
      "@type": "Car",
      name,
      url,
      image: absoluteImages(deal.images),
      brand: { "@type": "Brand", name: make },
      manufacturer: { "@type": "Organization", name: make },
      model,
      vehicleModelDate: year,
      modelDate: year,
      vehicleConfiguration: text(deal.trim),
      bodyType: text(deal.bodyStyle),
      // Own-property lookup: fuel is free text in the DB, so a value like
      // "constructor" must fall back to the raw text, not a prototype member.
      fuelType: deal.fuel
        ? Object.hasOwn(FUEL_LABELS, deal.fuel)
          ? FUEL_LABELS[deal.fuel]
          : text(deal.fuel)
        : undefined,
      color: text(deal.exterior),
      vehicleInteriorColor: text(deal.interior),
      itemCondition: itemCondition(deal.condition),
      offers: offer(deal, url),
    });
  } catch (err) {
    console.error("buildDealJsonLd failed for deal", deal?.id, err);
    return null;
  }
}

// JSON.stringify doesn't escape "<", so a listing field containing
// "</script>" could break out of the tag. Replacing it with its unicode
// escape keeps the JSON identical to parsers (per Next's JSON-LD guide).
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
