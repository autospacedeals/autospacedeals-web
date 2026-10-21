// A sanity check on a listing's monthly payment against its MSRP, to catch
// typos before they go live ($11,729/mo for a $1,729 lease, $17 for $179).
// Real leases run about 0.4–1.8% of MSRP a month; anything above 4% or
// below 0.15% is almost certainly a mistyped number. One-pay leases have no
// monthly payment and are skipped.
const MAX_SHARE = 0.04;
const MIN_SHARE = 0.0015;

export function paymentProblem(d: { payment: number | null; msrp: number | null; onePay?: boolean | null }): string | null {
  if (d.onePay || !d.payment || !d.msrp || d.payment <= 0 || d.msrp <= 0) return null;
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const share = d.payment / d.msrp;
  if (share > MAX_SHARE) {
    return `The ${money(d.payment)}/mo payment looks too high for a ${money(d.msrp)} MSRP — likely a typo.`;
  }
  if (share < MIN_SHARE) {
    return `The ${money(d.payment)}/mo payment looks too low for a ${money(d.msrp)} MSRP — likely a typo.`;
  }
  return null;
}
