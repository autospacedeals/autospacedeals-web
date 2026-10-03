"use client";

import { MessageSquare, Mail, CalendarCheck, Sparkles, ChevronRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { GetMatchedButton } from "@/components/GetMatched";
import { ContactSellerButton, type ContactKind } from "@/components/ContactSellerDialog";

/**
 * Compact contact action used on deal cards — one "Message seller" button
 * (sellers are reached only through Drive's messaging). Tonal rather than
 * filled, so a grid of 12 cards isn't 12 bright-blue buttons. Stops
 * click-through to the card's link.
 */
export function ContactActionsCompact({ deal }: { deal: Deal }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div onClick={stop}>
      <ContactSellerButton deal={deal} kind="message" className="btn btn-tonal btn-sm w-full">
        <MessageSquare /> Message seller
      </ContactSellerButton>
    </div>
  );
}

const ROW_CLASS =
  "group/row flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg focus-visible:-outline-offset-2";

/**
 * Full contact / lead-flow actions used on the deal detail page.
 * One big "Message seller" button (the page's one filled-blue button), then
 * the quieter actions as a list: two ready-written messages to the seller,
 * and "Get matched", which opens a dialog that emails
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
  // Each opens the message dialog with a ready-written message.
  const more: { kind: ContactKind; label: string; icon: typeof Mail }[] = [
    { kind: "request", label: "Request this deal", icon: Mail },
    { kind: "availability", label: "Check availability", icon: CalendarCheck },
  ];

  return (
    <div>
      {preview ? (
        <button type="button" disabled className="btn btn-primary btn-lg w-full px-4">
          <MessageSquare /> Message seller
        </button>
      ) : (
        <ContactSellerButton deal={deal} kind="message" className="btn btn-primary btn-lg w-full px-4">
          <MessageSquare /> Message seller
        </ContactSellerButton>
      )}
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
        {more.map(({ kind, label, icon: Icon }) => (
          <li key={label}>
            <ContactSellerButton deal={deal} kind={kind} className={ROW_CLASS}>
              <RowContent icon={Icon} label={label} />
            </ContactSellerButton>
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
