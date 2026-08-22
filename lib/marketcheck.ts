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
  if (Array.isArray(offer.titles) && typeof offer.titles[0] === "string" && offer.titles[0].trim()) {
    return offer.titles[0].trim();
  }
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
      .map((offer) => ({
        programName: programName(offer),
        amount: pickAmount(offer),
        offerType: typeof (offer as { offer_type?: unknown }).offer_type === "string"
          ? (offer as { offer_type: string }).offer_type
          : null,
        targetGroup:
          typeof (offer as { cashback_target_group?: unknown }).cashback_target_group === "string"
            ? (offer as { cashback_target_group: string }).cashback_target_group
            : null,
        description:
          Array.isArray((offer as { offers?: unknown }).offers) &&
          typeof (offer as { offers: unknown[] }).offers[0] === "string"
            ? ((offer as { offers: string[] }).offers[0] as string).trim()
            : null,
        validThrough:
          typeof (offer as { valid_through?: unknown }).valid_through === "string"
            ? (offer as { valid_through: string }).valid_through
            : null,
        source:
          typeof (offer as { source?: unknown }).source === "string"
            ? (offer as { source: string }).source
            : null,
      }));

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
