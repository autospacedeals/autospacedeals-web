"use client";

import { Phone, MessageSquare, Mail, CalendarCheck, Sparkles, ChevronRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealMailtoHref, dealTitle, phoneDigits } from "@/lib/deal-utils";

function matchMailto(deal: Deal): string {
  const subject = encodeURIComponent(`Get matched with deals like ${dealTitle(deal)}`);
  const body = encodeURIComponent(
    `Hi,\n\nI'd like to be matched with similar deals to this one:\n\n${dealTitle(deal)} — ${deal.state}\n\nMy budget / preferences:\n- Monthly payment around: $\n- Max due at signing: $\n- Body style: ${deal.bodyStyle ?? "Not specified"}\n- Fuel type: ${deal.fuel ?? "Not specified"}\n\nThanks!`
  );
  return `mailto:rob@idriveus.com?subject=${subject}&body=${body}`;
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
 * Call is tonal blue (the card's main action, but quieter than a filled
 * button, so a grid of 12 cards isn't 12 bright-blue buttons).
 */
export function ContactActionsCompact({ deal }: { deal: Deal }) {
  const phone = phoneDigits(deal.sellerPhone);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="grid grid-cols-2 gap-2" onClick={stop}>
      <a href={`tel:${phone}`} className="btn btn-tonal btn-sm">
        <Phone /> Call
      </a>
      <a href={`sms:${phone}`} className="btn btn-secondary btn-sm">
        <MessageSquare /> Text
      </a>
    </div>
  );
}

/**
 * Full contact / lead-flow actions used on the deal detail page.
 * Two big actions (Call is the page's one filled-blue button), then the
 * three email actions as a quiet list instead of five equal buttons.
 */
export function ContactActionsFull({ deal }: { deal: Deal }) {
  const phone = phoneDigits(deal.sellerPhone);

  const more = [
    { href: dealMailtoHref(deal, "Request this deal"), label: "Request this deal", icon: Mail },
    { href: availabilityMailto(deal), label: "Check availability", icon: CalendarCheck },
    { href: matchMailto(deal), label: "Get matched with similar deals", icon: Sparkles },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:${phone}`} className="btn btn-primary btn-lg px-4">
          <Phone /> Call seller
        </a>
        <a href={`sms:${phone}`} className="btn btn-secondary btn-lg px-4">
          <MessageSquare /> Text seller
        </a>
      </div>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {more.map(({ href, label, icon: Icon }) => (
          <li key={label}>
            <a
              href={href}
              className="group/row flex min-h-12 items-center gap-3 px-4 text-sm font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:-outline-offset-2"
            >
              <Icon
                size={16}
                className="shrink-0 text-fg-muted transition-colors group-hover/row:text-accent-fg"
              />
              {label}
              <ChevronRight
                size={16}
                className="ml-auto shrink-0 text-fg-faint transition-transform group-hover/row:translate-x-0.5"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
