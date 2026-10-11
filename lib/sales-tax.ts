// A shopper's sales tax rate by ZIP, for showing lease payments with tax
// (components/TaxRate.tsx). California only: a California lease is taxed
// on each monthly payment at the rate where the car is registered, so
// payment × (1 + rate) is right there; most other states tax leases
// differently (some on the whole price up front), so they get no estimate.
// The table is built from CDTFA's published rates — see
// scripts/build-ca-zip-tax.mjs (refresh each quarter).
// SERVER-ONLY: the table is only sent to signed-in shoppers, one ZIP at a time.
import table from "@/lib/data/ca-zip-sales-tax.json";

export interface ZipTaxRate {
  zip: string;
  // Percent, e.g. 10.25. Null outside California or for an unknown ZIP.
  rate: number | null;
  place: string | null;
  // The ZIP straddles places with different rates.
  approximate: boolean;
  effective: string;
}

const zips = table.zips as unknown as Record<string, [number, string] | [number, string, number]>;

export function taxRateForZip(zip: string): ZipTaxRate {
  const hit = /^\d{5}$/.test(zip) ? zips[zip] : undefined;
  return {
    zip,
    rate: hit ? hit[0] : null,
    place: hit ? hit[1] : null,
    approximate: Boolean(hit?.[2]),
    effective: table.effective,
  };
}
