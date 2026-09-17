// Pure lease-payment math for the standalone Lease Calculator page (and,
// later, a broker-side version). Mirrors the conventions already used for
// deal pages in lib/deal-utils.ts — same defensive Number.isFinite guards,
// and the same paymentTaxRate / dueAtSigningTaxRate split (two independent,
// optional percentages rather than one unified tax model).
//
// Standard lease formula:
//   depreciation fee = (net cap cost − residual value) / term
//   rent charge       = (net cap cost + residual value) × money factor
//   base monthly      = depreciation fee + rent charge
// See lib/marketcheck.ts's pickLeaseStructure() for where the residual %/
// money factor prefill values come from when real data is available.

function safeNumber(value: number, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface LeaseCalculatorInput {
  msrp: number;
  sellingPrice: number; // negotiated price — becomes gross cap cost
  residualPercent: number; // 0-100, % of MSRP
  moneyFactor: number; // e.g. 0.00125
  term: number; // months
  downPayment: number; // cap cost reduction, paid at signing
  incentivesTotal: number; // rebates/incentives applied as additional cap cost reduction
  acquisitionFee: number; // rolled into cap cost (standard convention — almost never paid upfront)
  dispositionFee: number; // informational only — due at lease-end, not part of any total here
  docFee: number; // dealer/DMV fee due at signing, not capitalized
  // Whether the first month's payment is bundled into "due at signing" —
  // the near-universal convention ("drive-off" quotes always include it),
  // but exposed so a shopper who's quoting a "$0 first payment" deal can
  // turn it off.
  includeFirstPaymentAtSigning: boolean;
  paymentTaxRate: number; // % applied to the monthly payment
  dueAtSigningTaxRate: number; // % applied to the due-at-signing amount
}

export const DEFAULT_LEASE_INPUT: LeaseCalculatorInput = {
  msrp: 0,
  sellingPrice: 0,
  residualPercent: 55,
  moneyFactor: 0.00125, // ≈ 3% APR-equivalent — a reasonable starting guess, not a quote
  term: 36,
  downPayment: 0,
  incentivesTotal: 0,
  acquisitionFee: 0,
  dispositionFee: 0,
  docFee: 0,
  includeFirstPaymentAtSigning: true,
  paymentTaxRate: 0,
  dueAtSigningTaxRate: 0,
};

export interface LeaseCalculatorResult {
  grossCapCost: number;
  netCapCost: number;
  residualValue: number;
  depreciationFee: number;
  rentCharge: number;
  baseMonthly: number;
  monthlyTax: number;
  monthlyPayment: number;
  dueAtSigningBase: number;
  dueAtSigningTax: number;
  dueAtSigning: number;
  remainingPayments: number; // payments still owed after signing
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
  const downPayment = Math.max(0, safeNumber(input.downPayment));
  const incentivesTotal = Math.max(0, safeNumber(input.incentivesTotal));
  const acquisitionFee = Math.max(0, safeNumber(input.acquisitionFee));
  const docFee = Math.max(0, safeNumber(input.docFee));
  const paymentTaxRate = Math.max(0, safeNumber(input.paymentTaxRate));
  const dueAtSigningTaxRate = Math.max(0, safeNumber(input.dueAtSigningTaxRate));
  const includeFirstPaymentAtSigning = input.includeFirstPaymentAtSigning !== false;

  const grossCapCost = sellingPrice + acquisitionFee;
  const netCapCost = Math.max(0, grossCapCost - downPayment - incentivesTotal);
  const residualValue = msrp * (residualPercent / 100);

  const depreciationFee = (netCapCost - residualValue) / term;
  const rentCharge = (netCapCost + residualValue) * moneyFactor;
  const baseMonthly = Math.max(0, depreciationFee + rentCharge);

  const monthlyTax = baseMonthly * (paymentTaxRate / 100);
  const monthlyPayment = baseMonthly + monthlyTax;

  const dueAtSigningBase =
    downPayment + docFee + (includeFirstPaymentAtSigning ? monthlyPayment : 0);
  const dueAtSigningTax = dueAtSigningBase * (dueAtSigningTaxRate / 100);
  const dueAtSigning = dueAtSigningBase + dueAtSigningTax;

  const remainingPayments = includeFirstPaymentAtSigning ? Math.max(0, term - 1) : term;
  const totalOfPayments = remainingPayments * monthlyPayment;
  const totalLeaseCost = dueAtSigning + totalOfPayments;
  const effectiveMonthly = totalLeaseCost / term;

  return {
    grossCapCost,
    netCapCost,
    residualValue,
    depreciationFee,
    rentCharge,
    baseMonthly,
    monthlyTax,
    monthlyPayment,
    dueAtSigningBase,
    dueAtSigningTax,
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
