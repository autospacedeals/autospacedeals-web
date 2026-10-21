// /llms.txt: a plain-text summary of Drive for AI assistants and their
// crawlers (the llms.txt convention) — what the site is, who it's for, and
// links to every make and model with live deals and its lowest payment.
// Built from the live listings on each request.
import { getPublishedDeals } from "@/lib/supabase/deals";
import { formatCurrency } from "@/lib/deal-utils";
import { SITE_URL } from "@/lib/site";
import { REGION, catalog, makePath, modelPath, plural } from "@/lib/lease-pages";
import { driveFaq, driveStats } from "@/lib/drive-facts";

export const dynamic = "force-dynamic";

export async function GET() {
  const deals = await getPublishedDeals();
  const makes = catalog(deals);
  const sellers = new Set(deals.map((d) => d.brokerId ?? d.sellerName)).size;
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const lines = [
    "# Drive (idriveus.com)",
    "",
    `> Drive is a car lease marketplace for ${REGION}. Shoppers compare real lease deals from local dealers and auto brokers — monthly payment, due at signing, term, mileage and broker fee side by side — and message the seller directly. Free for shoppers.`,
    "",
    `As of ${today}: ${plural(deals.length, "live lease deal")} from ${sellers} sellers across ${plural(makes.length, "brand")}. Deals come from licensed California dealers and brokers, who post and update their own offers; payments are before sales tax unless a listing says otherwise.`,
    "",
    "## Main pages",
    "",
    `- [All lease deals, searchable](${SITE_URL}/): filter by make, model, body style, payment, term and seller`,
    `- [Best lease deals this month](${SITE_URL}/best-lease-deals): lowest payments, lowest total cost, best EV, hybrid, SUV and luxury leases`,
    `- [About Drive](${SITE_URL}/about): who Drive is, where the deals come from, contact`,
    `- [How Drive works](${SITE_URL}/faq): questions and answers`,
    `- [Lease deals by make and model](${SITE_URL}/leases): the lowest payment for every car, updated live`,
    `- [Leasing guide](${SITE_URL}/leasing-guide): money factor, residual value, due at signing, MSDs explained`,
    `- [Lease calculator](${SITE_URL}/calculator): work out a payment from a quote`,
    `- [Lease-end options](${SITE_URL}/lease-end): return, buy out or trade in`,
    "",
    "## Questions and answers",
    "",
    ...driveFaq(driveStats(deals)).flatMap((f) => [`### ${f.q}`, "", f.a, ""]),
    "## Lease deals by car",
    "",
  ];
  for (const m of makes) {
    const low = m.summary.lowest;
    lines.push(
      `- [${m.make} lease deals](${SITE_URL}${makePath(m.make)}): ${plural(m.deals.length, "deal")}` +
        (low ? `, from ${formatCurrency(low.payment)}/mo` : "")
    );
    for (const mo of m.models) {
      const l = mo.summary.lowest;
      lines.push(
        `  - [${m.make} ${mo.model}](${SITE_URL}${modelPath(m.make, mo.model)}): ${plural(mo.deals.length, "deal")}` +
          (l ? `, from ${formatCurrency(l.payment)}/mo with ${formatCurrency(l.dueAtSigning)} due at signing` : "")
      );
    }
  }
  lines.push(
    "",
    "## For dealers and brokers",
    "",
    `- [List your deals on Drive](${SITE_URL}/contact?topic=dealer): posting is free while Drive launches`,
    ""
  );

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
