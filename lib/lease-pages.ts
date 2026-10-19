// The browse-by-car pages (/leases, /leases/[make], /leases/[make]/[model])
// and llms.txt: live deals grouped by make and model, with the facts a
// summary sentence states (how many, the lowest payment, terms, sellers).
// Built for search engines and AI answers, which quote pages that say
// plainly what's available and for how much, today.
import type { Deal } from "@/lib/deals-data";
import { formatCurrency } from "@/lib/deal-utils";
import { SITE_URL } from "@/lib/site";

export const REGION = "Southern California";

// "Mercedes-Benz" -> "mercedes-benz", "NX 450h+" -> "nx-450h".
export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makePath(make: string): string {
  return `/leases/${toSlug(make)}`;
}

export function modelPath(make: string, model: string): string {
  return `/leases/${toSlug(make)}/${toSlug(model)}`;
}

// A monthly lease (not one-pay) with a real payment: the ones a "from
// $X/mo" can be stated for.
const monthly = (d: Deal) => !d.onePay && d.payment > 0;

export interface DealSummary {
  count: number;
  sellers: number;
  // The lowest monthly payment and that deal's due at signing.
  lowest: Deal | null;
  terms: number[];
  miles: number[];
  years: number[];
}

export function summarize(deals: Deal[]): DealSummary {
  const priced = deals.filter(monthly).sort((a, b) => a.payment - b.payment || a.dueAtSigning - b.dueAtSigning);
  const uniq = (xs: (number | null | undefined)[]) =>
    [...new Set(xs.filter((x): x is number => typeof x === "number" && x > 0))].sort((a, b) => a - b);
  return {
    count: deals.length,
    sellers: new Set(deals.map((d) => d.brokerId ?? d.sellerName)).size,
    lowest: priced[0] ?? null,
    terms: uniq(deals.map((d) => d.term)),
    miles: uniq(deals.map((d) => d.milesPerYear)),
    years: uniq(deals.map((d) => d.year)),
  };
}

export interface ModelGroup {
  model: string;
  slug: string;
  deals: Deal[];
  summary: DealSummary;
}

export interface MakeGroup {
  make: string;
  slug: string;
  deals: Deal[];
  summary: DealSummary;
  models: ModelGroup[];
}

// Every make with live deals, most deals first; each make's models the same.
export function catalog(deals: Deal[]): MakeGroup[] {
  const byMake = new Map<string, Deal[]>();
  for (const d of deals) {
    if (!d.make || !d.model) continue;
    const key = toSlug(d.make);
    byMake.set(key, [...(byMake.get(key) ?? []), d]);
  }
  return [...byMake.entries()]
    .map(([slug, list]) => {
      const byModel = new Map<string, Deal[]>();
      for (const d of list) {
        const key = toSlug(d.model);
        if (key) byModel.set(key, [...(byModel.get(key) ?? []), d]);
      }
      const models = [...byModel.entries()]
        .map(([modelSlug, ds]) => ({ model: mostCommon(ds.map((d) => d.model)), slug: modelSlug, deals: ds, summary: summarize(ds) }))
        .sort((a, b) => b.deals.length - a.deals.length || a.model.localeCompare(b.model));
      return { make: mostCommon(list.map((d) => d.make)), slug, deals: list, summary: summarize(list), models };
    })
    .sort((a, b) => b.deals.length - a.deals.length || a.make.localeCompare(b.make));
}

function mostCommon(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? names[0] ?? "";
}

// Lowest payment first, so the page leads with the best deal.
export function byPayment(a: Deal, b: Deal): number {
  const pa = monthly(a) ? a.payment : Number.MAX_SAFE_INTEGER;
  const pb = monthly(b) ? b.payment : Number.MAX_SAFE_INTEGER;
  return pa - pb || a.dueAtSigning - b.dueAtSigning;
}

export function monthYear(date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function list(xs: string[]): string {
  if (xs.length <= 2) return xs.join(" and ");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

// "12 BMW X5 lease deals in Southern California from 4 sellers, starting at
// $689/mo with $3,500 due at signing. Terms: 24 to 39 months."
export function summarySentence(name: string, s: DealSummary): string {
  let text = `${plural(s.count, `${name} lease deal`)} in ${REGION} from ${plural(s.sellers, "seller")}`;
  if (s.lowest) {
    text += `, starting at ${formatCurrency(s.lowest.payment)}/mo with ${formatCurrency(s.lowest.dueAtSigning)} due at signing`;
  }
  text += ".";
  if (s.terms.length) {
    text +=
      s.terms.length === 1
        ? ` Term: ${s.terms[0]} months.`
        : ` Terms from ${s.terms[0]} to ${s.terms[s.terms.length - 1]} months.`;
  }
  if (s.miles.length) {
    text += ` Mileage: ${list(s.miles.map((m) => `${(m / 1000).toLocaleString("en-US")}k`))} miles a year.`;
  }
  return text;
}

// schema.org: the page's deals as a list, and where the page sits.
export function itemListJsonLd(name: string, deals: Deal[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: deals.length,
    itemListElement: deals.slice(0, 50).map((d, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/deals/${d.slug}`,
      name: `${d.year} ${d.make} ${d.model}${d.trim ? ` ${d.trim}` : ""} lease, ${formatCurrency(d.payment)}/mo`,
    })),
  };
}

export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
  };
}

// JSON for a <script type="application/ld+json">, with "<" escaped so text
// from a listing can't close the tag.
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
