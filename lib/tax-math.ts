// A lease's monthly payment with the shopper's sales tax (lib/sales-tax.ts).
// When the seller's payment already includes their assumed tax
// (paymentTaxRate), that's taken back out first. No estimate for one-pay
// leases (taxed on the whole amount, often differently).
import type { Deal } from "@/lib/deals-data";

export function monthlyWithTax(deal: Pick<Deal, "payment" | "onePay" | "paymentTaxRate">, ratePercent: number): number | null {
  if (deal.onePay || !(deal.payment > 0) || !(ratePercent >= 0)) return null;
  const base = deal.paymentTaxRate ? deal.payment / (1 + deal.paymentTaxRate / 100) : deal.payment;
  return Math.round(base * (1 + ratePercent / 100));
}
