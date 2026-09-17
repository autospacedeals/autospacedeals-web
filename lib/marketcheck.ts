// Wraps MarketCheck's OEM Incentive Search API to fetch real, currently-active
// manufacturer/dealer lease incentive programs — named offers with real dollar
// amounts (e.g. "BMW Loyalty Lease Credit", "+$2,500"), the same kind of data
// sites like Autopia show, instead of an AI-guessed ballpark. See
// lib/ai-incentives.ts, which tries this first and only falls back to a pure
// AI estimate when MarketCheck has nothing for the exact vehicle.
//
// Docs: https://docs.marketcheck.com/docs/api/cars/incentives/incentive-search-api

const BASE_URL = "https://api.marketcheck.com/v2/search/car/incentive/oem";

export interface MarketCheckIncentiveOffer {
  programName: string;
  amount: number | null;
  offerType: string | null; // "lease" | "finance" | "cash"
  targetGroup: string | null; // e.g. "Military personnel", "College graduates"
  description: string | null;
  validThrough: string | null;
  source: string | null; // site MarketCheck scraped this offer from
  // Raw lease-structure fields scraped alongside the incentive itself — a
  // real offer document already carries most of what a lease payment
  // calculator needs (residual, cap cost, money-factor-equivalent APR),
  // not just the rebate amount. See pickLeaseStructure() below, which
  // turns these into calculator-ready numbers.
  msrp: number | null;
  netCapCost: number | null;
  grossCapCost: number | null;
  residualValue: number | null; // lease_end_purchase_price
  acquisitionFee: number | null;
  dispositionFee: number | null;
  term: number | null;
  termUnit: string | null;
  aprEquivalent: number | null; // money-factor-equivalent APR, as a percent (e.g. 3.0)
}

export interface LeaseStructure {
  msrp: number;
  residualPercent: number; // 0-100
  moneyFactor: number; // e.g. 0.00125
  term: number;
  acquisitionFee: number | null;
  source: string; // program name this was pulled from, for a "based on ___" note
}

// Picks the single best real lease offer to prefill a calculator with — one
// that's actually typed as a lease and has enough of the structure (MSRP +
// residual, at minimum) to compute real numbers from, rather than an
// incentive-only offer (e.g. a pure loyalty rebate) that never carried a
// residual/cap-cost figure to begin with.
export function pickLeaseStructure(offers: MarketCheckIncentiveOffer[]): LeaseStructure | null {
  for (const o of offers) {
    if (o.offerType !== "lease") continue;
    if (!o.msrp || o.msrp <= 0 || !o.residualValue || o.residualValue <= 0) continue;
    if (!o.term || o.term <= 0) continue;

    const residualPercent = (o.residualValue / o.msrp) * 100;
    // APR-equivalent -> money factor is the standard conversion (money
    // factor × 2400 ≈ APR%); default to a conservative 0 (0% MF) rather
    // than guessing when MarketCheck didn't report one for this offer.
    const moneyFactor = o.aprEquivalent != null ? o.aprEquivalent / 2400 : 0;

    return {
      msrp: o.msrp,
      residualPercent,
      moneyFactor,
      term: o.term,
      acquisitionFee: o.acquisitionFee,
      source: o.programName,
    };
  }
  return null;
}

export interface MarketCheckLookupParams {
  year: number;
  make: string;
  model?: string;
  trim?: string;
  state?: string;
  zip?: string;
}

export interface MarketCheckLookupResult {
  offers: MarketCheckIncentiveOffer[];
  // null when the lookup succeeded (even with zero results). Set when the
  // lookup couldn't run at all (no key configured) or the request failed.
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickAmount(offer: any): number | null {
  // Prefer the figure that reads like the headline "+$X" number on a program
  // like this (cash-back/rebate first, then dealer contribution). We
  // deliberately do NOT invent a number when MarketCheck doesn't report one —
  // better to omit the program than show a wrong amount.
  if (typeof offer.cashback_amount === "number" && offer.cashback_amount > 0) {
    return offer.cashback_amount;
  }
  if (typeof offer.dealer_contribution === "number" && offer.dealer_contribution > 0) {
    return offer.dealer_contribution;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function programName(offer: any): string {
  if (typeof offer.oem_program_name === "string" && offer.oem_program_name.trim()) {
    return offer.oem_program_name.trim();
  }
  // Deliberately NOT falling back to `titles[0]` here — despite the docs
  // calling it "program titles and headlines," in practice it's frequently
  // raw ad-copy scraped off the OEM's vehicle page (e.g. "Un4gettable:
  // Designed to Catch Your Eye.") rather than an actual program name, and
  // showing that next to "✓ Verified current offer" undermines the whole
  // point of flagging it as verified, real data. A generic-but-accurate
  // label beats a slick-but-meaningless one.
  if (typeof offer.cashback_target_group === "string" && offer.cashback_target_group.trim()) {
    return `${offer.cashback_target_group.trim()} Offer`;
  }
  if (typeof offer.offer_type === "string" && offer.offer_type.trim()) {
    const t = offer.offer_type.trim();
    return `${t.charAt(0).toUpperCase()}${t.slice(1)} Offer`;
  }
  return "Manufacturer Offer";
}

async function runQuery(
  apiKey: string,
  params: MarketCheckLookupParams,
  includeTrim: boolean
): Promise<MarketCheckLookupResult> {
  const query = new URLSearchParams({
    api_key: apiKey,
    make: params.make.trim(),
    year: String(params.year),
    rows: "10",
  });
  if (params.model?.trim()) query.set("model", params.model.trim());
  if (includeTrim && params.trim?.trim()) query.set("trim", params.trim.trim());
  if (params.state?.trim()) query.set("state", params.state.trim());
  if (params.zip?.trim()) query.set("zip", params.zip.trim());

  try {
    const res = await fetch(`${BASE_URL}?${query.toString()}`, {
      headers: { Accept: "application/json" },
      // Incentive programs run for weeks at a time, not minutes — cache
      // briefly so re-suggesting on the same vehicle doesn't burn calls
      // against the free-tier quota.
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return { offers: [], error: `marketcheck_http_${res.status}` };
    }

    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listings: any[] = Array.isArray(data?.listings) ? data.listings : [];

    const offers: MarketCheckIncentiveOffer[] = listings
      .map((listing) => listing?.offer)
      .filter((offer): offer is Record<string, unknown> => !!offer && typeof offer === "object")
      .map((offer) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const o = offer as any;
        const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
        const firstAmount = Array.isArray(o.amounts) && o.amounts.length > 0 ? o.amounts[0] : null;

        return {
          programName: programName(offer),
          amount: pickAmount(offer),
          offerType: typeof o.offer_type === "string" ? o.offer_type : null,
          targetGroup: typeof o.cashback_target_group === "string" ? o.cashback_target_group : null,
          description:
            Array.isArray(o.offers) && typeof o.offers[0] === "string" ? String(o.offers[0]).trim() : null,
          validThrough: typeof o.valid_through === "string" ? o.valid_through : null,
          source: typeof o.source === "string" ? o.source : null,
          msrp: num(o.msrp),
          netCapCost: num(o.net_cap_cost),
          grossCapCost: num(o.gross_cap_cost),
          residualValue: num(o.lease_end_purchase_price),
          acquisitionFee: num(o.acquisition_fee),
          dispositionFee: num(o.disposition_fee),
          term: num(firstAmount?.term),
          termUnit: typeof firstAmount?.term_unit === "string" ? firstAmount.term_unit : null,
          aprEquivalent: num(firstAmount?.apr),
        };
      });

    return { offers, error: null };
  } catch (err) {
    console.error("MarketCheck incentive lookup failed:", err);
    return { offers: [], error: "network_error" };
  }
}

export async function fetchMarketCheckIncentives(
  params: MarketCheckLookupParams
): Promise<MarketCheckLookupResult> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (!apiKey) return { offers: [], error: "not_configured" };
  if (!params.make.trim() || !params.year) return { offers: [], error: "invalid_params" };

  const withTrim = await runQuery(apiKey, params, true);
  if (withTrim.offers.length > 0 || !params.trim?.trim()) return withTrim;

  // OEM incentive programs (loyalty, conquest, lease cash, etc.) are almost
  // always defined at the model level, not per exact trim string — and
  // MarketCheck's own trim label for a scraped offer frequently won't match
  // a broker's trim text character-for-character (e.g. "300 4MATIC" vs
  // "4MATIC"). Filtering on trim as a hard requirement was silently zeroing
  // out real matches and pushing everything to the AI-estimate fallback, so
  // if the trim-scoped search comes back empty, widen to make+model+year
  // before giving up on real data.
  const withoutTrim = await runQuery(apiKey, params, false);
  return withoutTrim.error ? withTrim : withoutTrim;
}
