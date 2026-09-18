// Pure lease-payment math for the standalone Lease Calculator page (and,
// later, a broker-side version). Mirrors the conventions already used for
// deal pages in lib/deal-utils.ts — same defensive Number.isFinite guards —
// but does NOT reuse deal-utils' paymentTaxRate/dueAtSigningTaxRate fields:
// those are explicitly disclosure-only labels on a Deal (never used in any
// calculation — see lib/deals-data.ts). Here the same-named fields drive
// real math, so the two upfront/monthly tax rates are kept strictly
// separate to avoid double-taxing the first month's payment (it's already
// taxed once via paymentTaxRate; only cash actually paid *in addition* to
// that — down payment, positive trade equity, upfront fees — gets
// dueAtSigningTaxRate applied on top).
//
// Standard lease formula:
//   depreciation fee = (net cap cost − residual value) / term
//   rent charge       = (net cap cost + residual value) × money factor
//   base monthly      = depreciation fee + rent charge
// See lib/marketcheck.ts's pickLeaseStructure() for where the residual %/
// money factor prefill values come from when real data is available — and
// note in the README-style comment there that MarketCheck's numbers are a
// starting point scraped from advertised offers, not a lender rate sheet,
// so they're always presented as editable, not authoritative.

function safeNumber(value: number, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface LeaseCalculatorInput {
  msrp: number;
  sellingPrice: number; // negotiated price — becomes part of gross cap cost
  residualPercent: number; // 0-100, % of MSRP, as quoted for standardMileage
  moneyFactor: number; // e.g. 0.00125

  term: number; // months

  // Residual is quoted for a standard annual-mileage bracket (usually
  // 10,000 or 12,000); driving more or less than that adjusts the
  // lease-end value up or down. Leaving annualMileage === standardMileage
  // is a no-op, so this never changes behavior unless a shopper actually
  // wants to model a different mileage allowance.
  annualMileage: number;
  standardMileage: number; // the bracket residualPercent was quoted for
  residualAdjustmentPerMile: number; // $ residual change per mile of difference from standard

  downPayment: number; // cash cap cost reduction, paid at signing

  // Net trade-in equity (tradeInValue − tradeInPayoff) works like an
  // additional cap cost reduction when positive; when negative (still owed
  // more than the trade is worth), it rolls into the cap cost instead of
  // being paid in cash. Kept separate from downPayment since it isn't a
  // cash line the same way.
  tradeInValue: number;
  tradeInPayoff: number;

  incentivesTotal: number; // rebates/incentives applied as additional cap cost reduction

  // A one-pay lease has no monthly bill — the whole lease's depreciation +
  // rent charge (plus tax) is collected up front instead. Mirrors the
  // onePay flag already used for listings in lib/deals-data.ts.
  onePay: boolean;

  acquisitionFee: number;
  acquisitionFeeCapitalized: boolean; // true = rolled into cap cost, false = paid at signing
  dispositionFee: number; // informational only — due at lease-end, not part of any total here
  docFee: number;
  docFeeCapitalized: boolean;
  govFee: number; // DMV/registration-type fee
  govFeeCapitalized: boolean;

  // Whether the first month's payment is bundled into "due at signing" —
  // ignored when onePay is true (there's no separate first payment).
  includeFirstPaymentAtSigning: boolean;
  paymentTaxRate: number; // % applied to the monthly payment (or the one-pay total)
  dueAtSigningTaxRate: number; // % applied to cash paid at signing as a cap cost reduction
}

export const DEFAULT_LEASE_INPUT: LeaseCalculatorInput = {
  msrp: 0,
  sellingPrice: 0,
  residualPercent: 55,
  moneyFactor: 0.00125, // ≈ 3% APR-equivalent — a reasonable starting guess, not a quote
  term: 36,
  annualMileage: 10000,
  standardMileage: 10000,
  residualAdjustmentPerMile: 0.01,
  downPayment: 0,
  tradeInValue: 0,
  tradeInPayoff: 0,
  incentivesTotal: 0,
  onePay: false,
  acquisitionFee: 0,
  acquisitionFeeCapitalized: true,
  dispositionFee: 0,
  docFee: 0,
  docFeeCapitalized: false,
  govFee: 0,
  govFeeCapitalized: false,
  includeFirstPaymentAtSigning: true,
  paymentTaxRate: 0,
  dueAtSigningTaxRate: 0,
};

export interface DueAtSigningBreakdown {
  downPayment: number;
  upfrontFees: number;
  firstPayment: number; // 0 when onePay or includeFirstPaymentAtSigning is false
  onePayTotal: number; // 0 unless onePay
  tax: number;
}

export interface LeaseCalculatorResult {
  percentOffMsrp: number;
  tradeEquity: number; // tradeInValue − tradeInPayoff; negative when underwater

  baseResidualValue: number; // before mileage adjustment
  residualAdjustmentDollars: number; // signed — negative means the adjustment lowered residual
  residualValue: number; // after mileage adjustment — this is what the math below uses
  adjustedResidualPercent: number;

  grossCapCost: number;
  netCapCost: number;
  depreciationFee: number;
  rentCharge: number;
  baseMonthly: number;
  monthlyTax: number;
  monthlyPayment: number; // 0 when onePay
  onePayTotal: number; // 0 unless onePay

  dueAtSigningBreakdown: DueAtSigningBreakdown;
  dueAtSigning: number;

  remainingPayments: number; // payments still owed after signing (0 when onePay)
  totalOfPayments: number; // remainingPayments × monthlyPayment
  totalLeaseCost: number; // dueAtSigning + totalOfPayments
  effectiveMonthly: number; // totalLeaseCost spread evenly across the full term
}

export function computeLeaseEstimate(rawInput: Partial<LeaseCalculatorInput>): LeaseCalculatorResult {
  const input: LeaseCalculatorInput = { ...DEFAULT_LEASE_INPUT, ...rawInput };

  const msrp = safeNumber(input.msrp);
  const sellingPrice = safeNumber(input.sellingPrice) || msrp;
  const residualPercent = Math.min(100, Math.max(0, safeNumber(input.residualPercent)));
  const moneyFactor = Math.max(0, safeNumber(input.moneyFactor));
  const term = safeNumber(input.term) > 0 ? safeNumber(input.term) : 1;

  const annualMileage = Math.max(0, safeNumber(input.annualMileage, DEFAULT_LEASE_INPUT.annualMileage));
  const standardMileage = Math.max(
    1,
    safeNumber(input.standardMileage, DEFAULT_LEASE_INPUT.standardMileage)
  );
  const residualAdjustmentPerMile = Math.max(0, safeNumber(input.residualAdjustmentPerMile));

  const downPayment = Math.max(0, safeNumber(input.downPayment));
  const tradeInValue = Math.max(0, safeNumber(input.tradeInValue));
  const tradeInPayoff = Math.max(0, safeNumber(input.tradeInPayoff));
  const tradeEquity = tradeInValue - tradeInPayoff;

  const incentivesTotal = Math.max(0, safeNumber(input.incentivesTotal));
  const onePay = input.onePay === true;

  const acquisitionFee = Math.max(0, safeNumber(input.acquisitionFee));
  const docFee = Math.max(0, safeNumber(input.docFee));
  const govFee = Math.max(0, safeNumber(input.govFee));
  const acquisitionFeeCapitalized = input.acquisitionFeeCapitalized !== false;
  const docFeeCapitalized = input.docFeeCapitalized === true;
  const govFeeCapitalized = input.govFeeCapitalized === true;

  const paymentTaxRate = Math.max(0, safeNumber(input.paymentTaxRate));
  const dueAtSigningTaxRate = Math.max(0, safeNumber(input.dueAtSigningTaxRate));
  const includeFirstPaymentAtSigning = input.includeFirstPaymentAtSigning !== false;

  const percentOffMsrp = msrp > 0 ? Math.max(0, ((msrp - sellingPrice) / msrp) * 100) : 0;

  // Mileage adjustment: residual is quoted for `standardMileage`/year — more
  // total miles over the lease lowers what the car is worth at turn-in,
  // fewer miles raises it. A no-op when annualMileage === standardMileage.
  const baseResidualValue = msrp * (residualPercent / 100);
  const totalStandardMiles = standardMileage * (term / 12);
  const totalActualMiles = annualMileage * (term / 12);
  const mileageDelta = totalActualMiles - totalStandardMiles;
  const residualAdjustmentDollars = -mileageDelta * residualAdjustmentPerMile;
  const residualValue = Math.max(0, baseResidualValue + residualAdjustmentDollars);
  const adjustedResidualPercent = msrp > 0 ? (residualValue / msrp) * 100 : 0;

  const capitalizedFees =
    (acquisitionFeeCapitalized ? acquisitionFee : 0) +
    (docFeeCapitalized ? docFee : 0) +
    (govFeeCapitalized ? govFee : 0);
  const upfrontFees =
    (acquisitionFeeCapitalized ? 0 : acquisitionFee) +
    (docFeeCapitalized ? 0 : docFee) +
    (govFeeCapitalized ? 0 : govFee);

  const grossCapCost = sellingPrice + capitalizedFees;
  // Positive trade equity reduces the cap cost like cash down; negative
  // (upside-down) equity increases it instead, since that shortfall gets
  // rolled in rather than paid up front.
  const netCapCost = Math.max(0, grossCapCost - downPayment - incentivesTotal - tradeEquity);

  const depreciationFee = (netCapCost - residualValue) / term;
  const rentCharge = (netCapCost + residualValue) * moneyFactor;
  const baseMonthly = Math.max(0, depreciationFee + rentCharge);

  const monthlyTax = baseMonthly * (paymentTaxRate / 100);
  const monthlyPayment = onePay ? 0 : baseMonthly + monthlyTax;
  const onePayTotal = onePay ? baseMonthly * term * (1 + paymentTaxRate / 100) : 0;

  // Only cash actually contributed as a cap cost reduction — down payment
  // and positive trade equity — is treated as taxable "due at signing"
  // cash for this estimate. The first month's payment (or the one-pay
  // total) is excluded here because it's already taxed once via
  // paymentTaxRate; taxing it again here would double-count it. Fees are
  // excluded too since their taxability varies too much by state to model
  // as a flat rate without giving a false sense of precision.
  const upfrontTaxableBase = downPayment + Math.max(0, tradeEquity);
  const tax = upfrontTaxableBase * (dueAtSigningTaxRate / 100);

  const firstPayment = !onePay && includeFirstPaymentAtSigning ? monthlyPayment : 0;

  const dueAtSigningBreakdown: DueAtSigningBreakdown = {
    downPayment,
    upfrontFees,
    firstPayment,
    onePayTotal,
    tax,
  };
  const dueAtSigning = downPayment + upfrontFees + firstPayment + onePayTotal + tax;

  const remainingPayments = onePay ? 0 : includeFirstPaymentAtSigning ? Math.max(0, term - 1) : term;
  const totalOfPayments = remainingPayments * monthlyPayment;
  const totalLeaseCost = dueAtSigning + totalOfPayments;
  const effectiveMonthly = totalLeaseCost / term;

  return {
    percentOffMsrp,
    tradeEquity,
    baseResidualValue,
    residualAdjustmentDollars,
    residualValue,
    adjustedResidualPercent,
    grossCapCost,
    netCapCost,
    depreciationFee,
    rentCharge,
    baseMonthly,
    monthlyTax,
    monthlyPayment,
    onePayTotal,
    dueAtSigningBreakdown,
    dueAtSigning,
    remainingPayments,
    totalOfPayments,
    totalLeaseCost,
    effectiveMonthly,
  };
}

// Money factor <-> APR-equivalent conversions, so the UI can let a shopper
// enter whichever one they were quoted (dealers usually say "money factor",
// shoppers usually think in APR%). Same 2400 constant used in
// lib/marketcheck.ts's pickLeaseStructure().
export function moneyFactorFromApr(aprPercent: number): number {
  return Math.max(0, safeNumber(aprPercent)) / 2400;
}

export function aprFromMoneyFactor(moneyFactor: number): number {
  return Math.max(0, safeNumber(moneyFactor)) * 2400;
}

// -----------------------------------------------------------------------------
// Shareable link encoding — packs the vehicle lookup fields + full input
// state into a compact, URL-safe string so a shopper can copy a link and
// hand someone else the exact same numbers instead of describing them.
// -----------------------------------------------------------------------------

export interface ShareableCalculatorState {
  vehicle: { year: string; make: string; model: string; trim: string; zip: string };
  input: LeaseCalculatorInput;
  aprMode: boolean;
}

function base64UrlEncode(json: string): string {
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + padding);
}

export function encodeCalculatorState(state: ShareableCalculatorState): string {
  try {
    return base64UrlEncode(JSON.stringify(state));
  } catch (err) {
    console.error("Failed to encode calculator state:", err);
    return "";
  }
}

export function decodeCalculatorState(encoded: string): ShareableCalculatorState | null {
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded));
    if (!parsed || typeof parsed !== "object" || !parsed.input || !parsed.vehicle) return null;
    return parsed as ShareableCalculatorState;
  } catch (err) {
    console.error("Failed to decode calculator state:", err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Lease-end calculator — buyout vs. return, the other real decision point
// every lessee eventually hits (not just "what will my payment be").
// -----------------------------------------------------------------------------
//
// The comparison that actually matters isn't "which total dollar amount is
// bigger" — it's "which option leaves you better off relative to doing
// nothing." Buying out isn't a pure cost: you end up owning a car worth
// something, so its true cost is what you pay minus what the car is worth
// (netCostOfBuyout — negative means you're getting built-in equity).
// Returning has no offsetting asset, so its cost is just the fees involved.
// Whichever net cost is lower wins.

export interface LeaseEndInput {
  // Buyout side
  residualPayoff: number; // what the lender says it costs to buy the car outright
  purchaseOptionFee: number; // fixed fee most lenders charge to exercise the buyout
  buyoutTaxRate: number; // % sales tax most states apply to the buyout amount
  estimatedMarketValue: number; // what the car could sell/trade for today — the shopper's own estimate

  // Return side
  dispositionFee: number; // charged by the lender for returning the car
  totalMilesDriven: number;
  totalMileageAllowance: number; // full-term allowance (e.g. annual mileage × years), not the annual figure
  excessMileageFeePerMile: number;
  estimatedWearAndTear: number; // optional manual estimate for excess wear/damage charges
}

export const DEFAULT_LEASE_END_INPUT: LeaseEndInput = {
  residualPayoff: 0,
  purchaseOptionFee: 350,
  buyoutTaxRate: 0,
  estimatedMarketValue: 0,
  dispositionFee: 0,
  totalMilesDriven: 0,
  totalMileageAllowance: 0,
  excessMileageFeePerMile: 0.25,
  estimatedWearAndTear: 0,
};

export type LeaseEndRecommendation = "buyout" | "return" | "close";

export interface LeaseEndResult {
  buyoutTaxAmount: number;
  buyoutTotalCost: number; // cash actually paid to buy the car out
  netCostOfBuyout: number; // buyoutTotalCost − estimatedMarketValue; negative = built-in equity

  excessMiles: number;
  excessMileageFee: number;
  returnTotalCost: number; // dispositionFee + excessMileageFee + estimatedWearAndTear (pure cost, no asset)

  recommendation: LeaseEndRecommendation;
  netAdvantage: number; // how much better the recommended option is, in dollars
}

// Below this gap, the two options are close enough that the "right" answer
// probably comes down to non-financial preference (want to keep the car?
// don't want the hassle of selling it?) more than the numbers.
const LEASE_END_CLOSE_THRESHOLD = 150;

export function computeLeaseEndEstimate(rawInput: Partial<LeaseEndInput>): LeaseEndResult {
  const input: LeaseEndInput = { ...DEFAULT_LEASE_END_INPUT, ...rawInput };

  const residualPayoff = Math.max(0, safeNumber(input.residualPayoff));
  const purchaseOptionFee = Math.max(0, safeNumber(input.purchaseOptionFee));
  const buyoutTaxRate = Math.max(0, safeNumber(input.buyoutTaxRate));
  const estimatedMarketValue = Math.max(0, safeNumber(input.estimatedMarketValue));

  const dispositionFee = Math.max(0, safeNumber(input.dispositionFee));
  const totalMilesDriven = Math.max(0, safeNumber(input.totalMilesDriven));
  const totalMileageAllowance = Math.max(0, safeNumber(input.totalMileageAllowance));
  const excessMileageFeePerMile = Math.max(0, safeNumber(input.excessMileageFeePerMile));
  const estimatedWearAndTear = Math.max(0, safeNumber(input.estimatedWearAndTear));

  const buyoutTaxAmount = residualPayoff * (buyoutTaxRate / 100);
  const buyoutTotalCost = residualPayoff + purchaseOptionFee + buyoutTaxAmount;
  const netCostOfBuyout = buyoutTotalCost - estimatedMarketValue;

  const excessMiles = Math.max(0, totalMilesDriven - totalMileageAllowance);
  const excessMileageFee = excessMiles * excessMileageFeePerMile;
  const returnTotalCost = dispositionFee + excessMileageFee + estimatedWearAndTear;

  const gap = returnTotalCost - netCostOfBuyout; // positive = buyout is cheaper
  let recommendation: LeaseEndRecommendation;
  let netAdvantage: number;
  if (Math.abs(gap) < LEASE_END_CLOSE_THRESHOLD) {
    recommendation = "close";
    netAdvantage = Math.abs(gap);
  } else if (gap > 0) {
    recommendation = "buyout";
    netAdvantage = gap;
  } else {
    recommendation = "return";
    netAdvantage = -gap;
  }

  return {
    buyoutTaxAmount,
    buyoutTotalCost,
    netCostOfBuyout,
    excessMiles,
    excessMileageFee,
    returnTotalCost,
    recommendation,
    netAdvantage,
  };
}
