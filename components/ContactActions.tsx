"use client";

import { Phone, MessageSquare, Mail, CalendarCheck, Sparkles, ChevronRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealMailtoHref, dealTitle, phoneDigits } from "@/lib/deal-utils";
import { GetMatchedButton } from "@/components/GetMatched";

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

const ROW_CLASS =
  "group/row flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:-outline-offset-2";

/**
 * Full contact / lead-flow actions used on the deal detail page.
 * Two big actions (Call is the page's one filled-blue button), then the
 * three quieter actions as a list instead of five equal buttons: two
 * emails to the seller, and "Get matched", which opens a dialog that emails
 * the shopper the similar deals already shown on the page (`similarIds`,
 * computed by the page — see components/GetMatched.tsx). On a broker's
 * draft preview (`preview`) "Get matched" stays inert: the listing isn't
 * live, so there's nothing to match it with yet.
 */
export function ContactActionsFull({
  deal,
  similarIds = [],
  alertsAvailable = false,
  preview = false,
}: {
  deal: Deal;
  similarIds?: string[];
  alertsAvailable?: boolean;
  preview?: boolean;
}) {
  const phone = phoneDigits(deal.sellerPhone);

  const more = [
    { href: dealMailtoHref(deal, "Request this deal"), label: "Request this deal", icon: Mail },
    { href: availabilityMailto(deal), label: "Check availability", icon: CalendarCheck },
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
            <a href={href} className={ROW_CLASS}>
              <RowContent icon={Icon} label={label} />
            </a>
          </li>
        ))}
        <li>
          {preview ? (
            <button
              type="button"
              disabled
              className="flex min-h-12 w-full cursor-not-allowed items-center gap-3 px-4 text-left text-sm font-medium text-fg-muted"
            >
              <Sparkles size={16} className="shrink-0" />
              Get matched with similar deals
              <span className="ml-auto shrink-0 text-xs font-normal">Once published</span>
            </button>
          ) : (
            <GetMatchedButton
              deal={deal}
              similarIds={similarIds}
              alertsAvailable={alertsAvailable}
              className={ROW_CLASS}
            >
              <RowContent icon={Sparkles} label="Get matched with similar deals" />
            </GetMatchedButton>
          )}
        </li>
      </ul>
    </div>
  );
}

function RowContent({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return (
    <>
      <Icon size={16} className="shrink-0 text-fg-muted transition-colors group-hover/row:text-accent-fg" />
      {label}
      <ChevronRight
        size={16}
        className="ml-auto shrink-0 text-fg-faint transition-transform group-hover/row:translate-x-0.5"
      />
    </>
  );
}
