// Builds lib/data/ca-zip-sales-tax.json: the sales tax rate for each
// California ZIP code, used to show shoppers a lease payment with their tax
// (lib/sales-tax.ts). A California lease is taxed at the rate where the car
// is registered — the lessee's address.
//
// Sources (re-download each quarter; CDTFA rates change Jan 1 / Apr 1 /
// Jul 1 / Oct 1):
//   1. CDTFA "California City & County Sales & Use Tax Rates" (.xlsx) —
//      https://www.cdtfa.ca.gov/taxes-and-fees/sales-use-tax-rates.htm
//   2. Census 2020 ZCTA-to-place and ZCTA-to-county relationship files —
//      https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/
//      tab20_zcta520_place20_natl.txt, tab20_zcta520_county20_natl.txt
//
// Each ZIP takes the rate of the incorporated city covering most of its
// land (or at least 5% of it — the rest is usually hills, farmland, parks
// or a base, and people live in the town); otherwise the county's (unincorporated) rate. ZIPs split between
// places with different rates are marked approximate.
//
// Usage: node scripts/build-ca-zip-tax.mjs <rates.xlsx> <zcta_place.txt> <zcta_county.txt>
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const [ratesPath, placePath, countyPath] = process.argv.slice(2);
if (!ratesPath || !placePath || !countyPath) {
  console.error("Usage: node scripts/build-ca-zip-tax.mjs <rates.xlsx> <zcta_place.txt> <zcta_county.txt>");
  process.exit(1);
}

const key = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

// CDTFA: city rates, county rates, and unincorporated-area rates for the
// counties whose cities and unincorporated areas differ.
const wb = XLSX.readFile(ratesPath);
const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
const cityRate = new Map(); // key(city) -> { name, rate, county }
// Census names that differ from CDTFA's.
const CITY_ALIASES = { commerce: "cityofcommerce", industry: "cityofindustry", angels: "angelscamp" };
function findCity(censusName) {
  // "San Buenaventura (Ventura)", "El Paso de Robles (Paso Robles)": the
  // name in parentheses is the one CDTFA uses.
  const inner = censusName.match(/\(([^)]+)\)/)?.[1];
  for (const n of [inner, censusName.replace(/\s*\(.*\)/, "")].filter(Boolean)) {
    const k = CITY_ALIASES[key(n)] ?? key(n);
    if (cityRate.has(k)) return cityRate.get(k);
  }
  return null;
}
const countyRate = new Map(); // key(county) -> rate (unincorporated)
// The sheet is named for the month the rates take effect ("October 2026").
const effective = wb.SheetNames[0];
for (const raw of sheet) {
  const r = raw.filter((c) => c !== undefined && c !== null && !String(c).startsWith("Use the up")).map(String);
  if (r.length < 4) continue;
  const [location, rateText, county, type] = r;
  const rate = Number(rateText);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 0.2) continue;
  if (type === "City") cityRate.set(key(location), { name: location, rate, county });
  else if (/unincorporated area$/i.test(location)) countyRate.set(key(county), rate);
  else if (type === "County" && !countyRate.has(key(county))) countyRate.set(key(county), rate);
}

function readRel(path) {
  const lines = fs.readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  const head = lines[0].split("|");
  return lines
    .slice(1)
    .filter(Boolean)
    .map((l) => Object.fromEntries(l.split("|").map((v, i) => [head[i], v])));
}

const CITY_SHARE = 0.05;
const isCa = (zcta) => /^9[0-6]\d{3}$/.test(zcta);

// Each ZIP's county (most land) and total land.
const zipCounty = new Map();
const zipLand = new Map();
for (const r of readRel(countyPath)) {
  const zip = r.GEOID_ZCTA5_20;
  if (!isCa(zip) || !r.GEOID_COUNTY_20?.startsWith("06")) continue;
  const part = Number(r.AREALAND_PART) || 0;
  zipLand.set(zip, Number(r.AREALAND_ZCTA5_20) || 0);
  const cur = zipCounty.get(zip);
  if (!cur || part > cur.part) zipCounty.set(zip, { name: r.NAMELSAD_COUNTY_20.replace(/ County$/, ""), part });
}

// Each ZIP's land in incorporated cities (CLASSFP C*), by city.
const zipCities = new Map();
for (const r of readRel(placePath)) {
  const zip = r.GEOID_ZCTA5_20;
  if (!isCa(zip) || !r.GEOID_PLACE_20?.startsWith("06") || !r.CLASSFP_PLACE_20?.startsWith("C")) continue;
  const name = r.NAMELSAD_PLACE_20.replace(/ (city|town)$/i, "");
  const part = Number(r.AREALAND_PART) || 0;
  if (part <= 0) continue;
  const list = zipCities.get(zip) ?? [];
  list.push({ name, part });
  zipCities.set(zip, list);
}

const out = {};
const unmatched = new Set();
let approximate = 0;
for (const [zip, county] of zipCounty) {
  const land = zipLand.get(zip) || 1;
  const cities = (zipCities.get(zip) ?? []).sort((a, b) => b.part - a.part);
  const inCities = cities.reduce((n, c) => n + c.part, 0);
  const unincorporated = Math.max(0, land - inCities);
  const top = cities[0];
  let place;
  let rate;
  let share;
  const city = top && findCity(top.name);
  if (top && !city) unmatched.add(`${top.name} (${county.name})`);
  // Land isn't people: a city covering a real share of a ZIP is where its
  // residents are (the rest is often hills, parks or a base).
  if (top && city && (top.part >= unincorporated || top.part / land >= CITY_SHARE)) {
    place = city.name;
    rate = city.rate;
    share = top.part / land;
  } else {
    rate = countyRate.get(key(county.name));
    place = `${county.name} County`;
    share = unincorporated / land;
  }
  if (!rate) continue;
  // Another place with a different rate covers a real part of the ZIP.
  const otherRates = cities
    .filter((c) => c !== top || place.endsWith("County"))
    // A town inside a mostly-unincorporated ZIP counts even when small.
    .filter((c) => c.part / land > (place.endsWith("County") ? 0.03 : 0.15))
    .map((c) => findCity(c.name)?.rate)
    .filter((r) => r && r !== rate);
  const countyOther = !place.endsWith("County") && unincorporated / land > 0.3 && countyRate.get(key(county.name)) !== rate;
  const approx = share < 0.7 && (otherRates.length > 0 || countyOther);
  if (approx) approximate++;
  out[zip] = approx ? [Math.round(rate * 100000) / 1000, place, 1] : [Math.round(rate * 100000) / 1000, place];
}

const result = {
  effective,
  source: "CDTFA city/county sales and use tax rates + Census 2020 ZCTA relationship files",
  zips: Object.fromEntries(Object.entries(out).sort()),
};
fs.writeFileSync(new URL("../lib/data/ca-zip-sales-tax.json", import.meta.url), JSON.stringify(result));
console.log(`${Object.keys(out).length} ZIPs, ${approximate} approximate. ${effective}`);
if (unmatched.size) console.log(`Cities not in the CDTFA list (used the county rate): ${[...unmatched].join(", ")}`);
