"use client";

import { Fragment, useEffect } from "react";
import Link from "next/link";
import { X, ArrowRight } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import {
  dealTitle,
  displayMsrp,
  effectiveMonthly,
  formatCurrency,
  msrpDiscountPercent,
  formatMileage,
  formatTerm,
  formatMsds,
} from "@/lib/deal-utils";

// A lightweight, client-only side-by-side view — no new route, since the
// homepage already has every selected deal's full data in memory. Laid out
// as a real comparison table (one sticky label column + one column per
// deal) that scrolls horizontally on phones, so every row lines up across
// 2 or 3 deals without conditional column classes. Deliberately neutral:
// no "best deal" highlighting (deal scores were removed from the site).
export default function CompareModal({
  deals,
  onRemove,
  onClose,
}: {
  deals: Deal[];
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  // Escape closes the comparison, like any other dialog.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // One shared label per row now that deals sit side by side: keep the old
  // per-deal wording when every deal agrees, and let the cell's unit tell
  // them apart when one-pay and monthly deals are mixed.
  const onePayCount = deals.filter((d) => d.onePay).length;
  const mixedPayment = onePayCount > 0 && onePayCount < deals.length;
  const paymentLabel = mixedPayment
    ? "Payment"
    : onePayCount > 0
      ? "One-pay total"
      : "Monthly payment";

  const rows: { label: string; note?: string; render: (d: Deal) => React.ReactNode }[] = [
    {
      label: paymentLabel,
      render: (d) =>
        d.onePay ? (
          <span className="stat-value text-xl">
            {formatCurrency(d.dueAtSigning)}
            {mixedPayment && <span className="price-unit"> one-pay total</span>}
          </span>
        ) : (
          <span className="stat-value text-xl">
            {formatCurrency(d.payment)}
            <span className="price-unit">/mo</span>
          </span>
        ),
    },
    { label: "Due at signing", render: (d) => formatCurrency(d.dueAtSigning) },
    {
      label: "Effective monthly cost",
      note: "payment + due at signing spread over the term",
      render: (d) => formatCurrency(effectiveMonthly(d)),
    },
    { label: "Term", render: (d) => formatTerm(d.term) },
    {
      label: "Mileage",
      render: (d) => (d.milesPerYear ? formatMileage(d.milesPerYear) : "N/A"),
    },
    { label: "MSDs", render: (d) => (d.msdCount ? formatMsds(d.msdCount, d.msdTotal) : "None") },
    { label: "MSRP", render: (d) => displayMsrp(d) },
    {
      label: "Off MSRP",
      render: (d) => {
        const discount = msrpDiscountPercent(d);
        return discount > 0 ? `${discount.toFixed(0)}%` : "—";
      },
    },
  ];

  // Sticky label column. The negative margin + matching padding pulls its
  // background over the scroller's left gutter, so deal columns scrolling
  // sideways underneath never show through beside it and the labels keep
  // their inset once stuck to the edge. The sticky offset matches that
  // negative margin: sticky insets are measured from inside the scroller's
  // padding, so `left-0` would shove the cell back right over the first
  // deal column.
  const stickyCell = "sticky -left-5 z-10 -ml-5 bg-overlay pl-5 sm:-left-6 sm:-ml-6 sm:pl-6";

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-scrim backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-title"
        className="modal flex max-h-[88vh] w-full animate-rise flex-col sm:max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <h2 id="compare-title" className="type-title">
            Comparing {deals.length} deals
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="btn btn-ghost btn-icon btn-sm"
          >
            <X />
          </button>
        </div>

        {deals.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-fg-muted">
            Nothing to compare — add a deal from the grid first.
          </p>
        ) : (
          <div className="overflow-auto px-5 sm:px-6">
            {/* The floor is the sum of the column minimums (11rem + the 1rem
                gap per deal), not min-w-max: a max-content floor would widen
                every 1fr column to its widest content, including each
                photo's natural pixel width. Phones scroll 11rem columns;
                wider screens share the space. The grid box still spans every
                column, so the sticky label column stays stuck. */}
            <div
              className="grid gap-x-4"
              style={{
                gridTemplateColumns: `8.5rem repeat(${deals.length}, minmax(11rem, 1fr))`,
                minWidth: `calc(8.5rem + ${deals.length} * 12rem)`,
              }}
            >
              {/* header row: empty label cell + one column head per deal */}
              <div className={stickyCell} />
              {deals.map((deal) => (
                <div key={deal.id} className="py-5">
                  <div className="media-stage aspect-[4/3] rounded-xl">
                    <img src={deal.images[0]} alt={dealTitle(deal)} className="media-img" />
                  </div>
                  <h3 className="type-card mt-3 text-base">{dealTitle(deal)}</h3>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {deal.sellerName} · {deal.city}, {deal.state}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRemove(deal.id)}
                    className="btn btn-ghost btn-sm mt-1 -ml-3 px-3 text-fg-muted"
                  >
                    <X /> Remove
                  </button>
                </div>
              ))}

              {rows.map((row) => (
                <Fragment key={row.label}>
                  <div className={stickyCell}>
                    <div className="h-full border-t border-line py-3 pr-3">
                      <p className="text-xs font-medium text-fg-muted">{row.label}</p>
                      {row.note && (
                        <p className="mt-0.5 text-[11px] leading-4 text-fg-muted">{row.note}</p>
                      )}
                    </div>
                  </div>
                  {deals.map((deal) => (
                    <div
                      key={deal.id}
                      className="border-t border-line py-3 text-sm font-semibold text-fg"
                    >
                      {row.render(deal)}
                    </div>
                  ))}
                </Fragment>
              ))}

              <div className={stickyCell} />
              {deals.map((deal) => (
                <div key={deal.id} className="border-t border-line py-4">
                  <Link href={`/deals/${deal.slug}`} className="btn btn-secondary btn-sm w-full">
                    View full details <ArrowRight />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="border-t border-line px-5 py-4 text-xs leading-5 text-fg-muted sm:px-6">
          Effective monthly cost is the fairest single number to compare across deals with
          different due-at-signing amounts — a lower monthly payment with a much larger upfront
          cost isn&apos;t always the better deal.
        </p>
      </div>
    </div>
  );
}
