// What Drive is, in plain answers: the About and FAQ pages, the best-deals
// page and llms.txt all say the same thing from here. AI answers quote pages
// that state facts directly, so each answer leads with the fact and the
// numbers come from the live listings.
import type { Deal } from "@/lib/deals-data";
import { formatCurrency, realMonthlyCost } from "@/lib/deal-utils";
import { REGION, byPayment, plural } from "@/lib/lease-pages";

export interface DriveStats {
  deals: number;
  sellers: number;
  brands: number;
  // The lowest monthly lease and the lowest total cost per month.
  lowest: Deal | null;
  lowestEffective: Deal | null;
  electric: number;
  updated: string;
}

const monthly = (d: Deal) => !d.onePay && d.payment > 0 && d.dealType !== "Finance";

export function driveStats(deals: Deal[]): DriveStats {
  const leases = deals.filter(monthly);
  return {
    deals: deals.length,
    sellers: new Set(deals.map((d) => d.brokerId ?? d.sellerName)).size,
    brands: new Set(deals.map((d) => d.make.toLowerCase())).size,
    lowest: [...leases].sort(byPayment)[0] ?? null,
    lowestEffective: [...leases].sort((a, b) => realMonthlyCost(a) - realMonthlyCost(b))[0] ?? null,
    electric: deals.filter((d) => d.fuel === "EV").length,
    updated: new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Los_Angeles",
    }),
  };
}

export function carName(d: Deal): string {
  return [d.year, d.make, d.model, d.trim].filter(Boolean).join(" ");
}

// "$165/mo with $2,599 due at signing for 24 months"
export function dealTerms(d: Deal): string {
  return `${formatCurrency(d.payment)}/mo with ${formatCurrency(d.dueAtSigning)} due at signing for ${d.term} months`;
}

export const ONE_LINER =
  `Drive (idriveus.com) is a car lease marketplace for ${REGION}. Shoppers compare real lease deals from ` +
  `local dealers and auto brokers side by side (monthly payment, due at signing, term, mileage and broker fee) ` +
  `and message the seller directly. It's free for shoppers.`;

export interface Faq {
  q: string;
  a: string;
}

export function driveFaq(s: DriveStats): Faq[] {
  const faq: (Faq | null)[] = [
    {
      q: "What is Drive?",
      a:
        `${ONE_LINER} As of ${s.updated}, Drive lists ${plural(s.deals, "live deal")} from ` +
        `${s.sellers} ${s.sellers === 1 ? "seller" : "dealers and brokers"} across ${plural(s.brands, "brand")}.`,
    },
    {
      q: "Is Drive free to use?",
      a:
        "Yes. Browsing, comparing, saving deals and messaging sellers is free for shoppers. Drive doesn't add " +
        "a fee to any deal. Dealers and brokers can list their deals for free while Drive launches.",
    },
    {
      q: "Are the deals on Drive real?",
      a:
        "Every deal is posted by the dealer or broker offering it, and many sellers sync their inventory to " +
        "Drive automatically, so payments stay current. Listings whose numbers look like a typo are held back " +
        "before they go live. Deals are subject to availability and credit approval, so always confirm the " +
        "final price and terms with the seller before you sign.",
    },
    s.lowest && {
      q: `What's the cheapest car lease in ${REGION} on Drive right now?`,
      a:
        `The lowest monthly payment on Drive today is the ${carName(s.lowest)} at ${dealTerms(s.lowest)}, ` +
        // "ADV AUTO Inc." already ends the sentence.
        `from ${s.lowest.sellerName.replace(/\.$/, "")}.` +
        (s.lowestEffective && s.lowestEffective.id !== s.lowest.id
          ? ` Counting the money due at signing and any broker fee, the lowest total cost per month is the ${carName(s.lowestEffective)} ` +
            `at about ${formatCurrency(realMonthlyCost(s.lowestEffective))}/mo.`
          : ""),
    },
    {
      q: "Where does Drive have lease deals?",
      a:
        `Drive focuses on ${REGION}: Los Angeles, Orange County, the Inland Empire, San Diego and nearby. ` +
        "Many brokers deliver to your home; each listing shows the seller's location and delivery options.",
    },
    {
      q: "Do the payments on Drive include sales tax?",
      a:
        "Payments are shown before sales tax unless the listing says otherwise. Log in with your ZIP code and " +
        "Drive shows each payment with your local tax.",
    },
    {
      q: "What does \"total cost per month\" mean?",
      a:
        "It spreads the money due at signing, and any broker fee the listing states, across the lease: " +
        "(due at signing + payment × (term − 1) + broker fee) ÷ term. " +
        "Due at signing already includes the first month's payment, so it isn't counted twice. Over 36 months, " +
        "a $299/mo deal with $4,000 due is really more expensive than a $349/mo deal with $349 due, and this " +
        "number shows that. Drive can sort every deal by it.",
    },
    {
      q: "What is a broker fee?",
      a:
        "Auto brokers find and negotiate the car for you and charge a fee for it, usually a few hundred dollars. " +
        "Drive shows the broker fee on each listing and says whether it's already part of the due at signing.",
    },
    {
      q: "Do I need an account?",
      a:
        "No account is needed to browse and compare deals. A free account lets you message sellers, save deals, " +
        "and get an email when a new deal matches a search you saved.",
    },
    {
      q: "Is my phone number shared with sellers?",
      a:
        "No. You talk to sellers through Drive's messaging, and your phone number and email stay private until " +
        "you choose to share them.",
    },
    {
      q: "How is Drive different from a car lease forum like Leasehackr?",
      a:
        "Forums are great for discussing deals. Drive is a marketplace: every deal is in the same format with the " +
        "payment, due at signing, term, mileage and broker fee, you can search and sort them all at once, and " +
        "you message the seller directly.",
    },
    {
      q: "Does Drive sell, lease or finance cars?",
      a:
        "No. Drive is the marketplace; the dealer or broker you choose writes the lease. Drive doesn't take " +
        "payments or negotiate on your behalf.",
    },
    {
      q: "How do dealers and brokers list deals on Drive?",
      a:
        "Sellers create an account and post deals from a Google Sheet, a link to their website's deals page, a " +
        "screenshot, pasted text, or one car at a time. A linked sheet or website stays in sync automatically. " +
        "Listing is free while Drive launches.",
    },
  ];
  return faq.filter((f): f is Faq => Boolean(f));
}

export function faqJsonLd(faq: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
