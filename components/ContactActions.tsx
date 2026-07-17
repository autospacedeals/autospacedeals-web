"use client";

import { Phone, MessageSquare, Mail, CalendarCheck, Sparkles } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealMailtoHref, dealTitle, phoneDigits } from "@/lib/deal-utils";

function matchMailto(deal: Deal): string {
  const subject = encodeURIComponent(`Get matched with deals like ${dealTitle(deal)}`);
  const body = encodeURIComponent(
    `Hi,\n\nI'd like to be matched with similar deals to this one:\n\n${dealTitle(deal)} — ${deal.state}\n\nMy budget / preferences:\n- Monthly payment around: $\n- Max due at signing: $\n- Body style: ${deal.bodyStyle ?? "Not specified"}\n- Fuel type: ${deal.fuel ?? "Not specified"}\n\nThanks!`
  );
  return `mailto:mheryanrobert@gmail.com?subject=${subject}&body=${body}`;
}

function availabilityMailto(deal: Deal): string {
  const subject = encodeURIComponent(`Check availability: ${dealTitle(deal)}`);
  const body = encodeURIComponent(
    `Hi ${deal.sellerName},\n\nIs this deal still available?\n\n${dealTitle(deal)}\n${deal.city}, ${deal.state}\n\nThanks!`
  );
  return `mailto:${deal.sellerEmail}?subject=${subject}&body=${body}`;
}

/**
 * Compact contact actions used on deal cards — just Call and Text so the
 * card stays scannable. Stops click-through to the card's link.
 */
export function ContactActionsCompact({ deal }: { deal: Deal }) {
  const phone = phoneDigits(deal.sellerPhone);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="mt-4 grid grid-cols-2 gap-2" onClick={stop}>
      <a
        href={`tel:${phone}`}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
      >
        <Phone size={16} /> Call
      </a>
      <a
        href={`sms:${phone}`}
        className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
      >
        <MessageSquare size={16} /> Text
      </a>
    </div>
  );
}

/**
 * Full contact / lead-flow actions used on the deal detail page.
 */
export function ContactActionsFull({ deal }: { deal: Deal }) {
  const phone = phoneDigits(deal.sellerPhone);

  const actions = [
    { href: `tel:${phone}`, label: "Call Seller", icon: Phone, primary: true },
    { href: `sms:${phone}`, label: "Text Seller", icon: MessageSquare, primary: true },
    { href: dealMailtoHref(deal, "Request this deal"), label: "Request This Deal", icon: Mail },
    { href: availabilityMailto(deal), label: "Check Availability", icon: CalendarCheck },
    { href: matchMailto(deal), label: "Get Matched With Similar Deals", icon: Sparkles },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {actions.map(({ href, label, icon: Icon, primary }) => (
        <a
          key={label}
          href={href}
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
            primary
              ? "bg-white text-zinc-950 hover:bg-zinc-200"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <Icon size={16} /> {label}
        </a>
      ))}
    </div>
  );
}
