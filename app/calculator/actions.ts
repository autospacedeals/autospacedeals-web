"use server";

// Prefills the Lease Calculator from real data when it's available. Reuses
// the exact same sources the broker "Suggest with AI" flow already relies on
// (lib/marketcheck.ts, lib/ai-incentives.ts) — MarketCheck's OEM Incentive
// Search API first for real residual/money-factor/cap-cost numbers (see
// pickLeaseStructure), Claude only as a ballpark fallback for the incentive
// list. The calculator always stays editable either way; this just saves a
// shopper from having to know money factor / residual % off the top of
// their head.
import { fetchMarketCheckIncentives, pickLeaseStructure, pickLeaseStructures, type LeaseStructure } from "@/lib/marketcheck";
import { suggestIncentives, type SuggestedIncentive } from "@/lib/ai-incentives";

export interface LeaseNumbersLookup {
  structureSource: "verified" | "none";
  msrp: number | null;
  residualPercent: number | null;
  moneyFactor: number | null;
  term: number | null;
  acquisitionFee: number | null;
  // e.g. "BMW Loyalty Lease Credit" — the program this structure was pulled
  // from, for a "based on ___" note next to the prefilled fields.
  basedOn: string | null;
  incentives: SuggestedIncentive[];
  // Every real term program found (24mo, 36mo, 39mo, etc.), each with its
  // own residual %/money factor — lets the calculator's term stepper snap
  // to an actually-offered length and swap in that term's real numbers,
  // instead of assuming one term's residual/MF applies at every length.
  structures: LeaseStructure[];
}

export async function lookupLeaseNumbers(params: {
  year: number;
  make: string;
  model: string;
  trim?: string;
  state?: string;
  zip?: string;
}): Promise<LeaseNumbersLookup> {
  const [incentives, marketcheck] = await Promise.all([
    suggestIncentives(params),
    fetchMarketCheckIncentives(params),
  ]);

  const structure = pickLeaseStructure(marketcheck.offers);
  const structures = pickLeaseStructures(marketcheck.offers);

  if (!structure) {
    return {
      structureSource: "none",
      msrp: null,
      residualPercent: null,
      moneyFactor: null,
      term: null,
      acquisitionFee: null,
      basedOn: null,
      incentives,
      structures: [],
    };
  }

  return {
    structureSource: "verified",
    msrp: structure.msrp,
    residualPercent: Math.round(structure.residualPercent * 10) / 10,
    moneyFactor: structure.moneyFactor,
    term: structure.term,
    acquisitionFee: structure.acquisitionFee,
    basedOn: structure.source,
    incentives,
    structures,
  };
}
