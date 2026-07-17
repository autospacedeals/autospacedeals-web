"use client";

import { useState } from "react";
import { CheckSquare, Square } from "lucide-react";
import type { Deal } from "@/lib/deals-data";
import { dealTitle, formatCurrency } from "@/lib/deal-utils";
import { confirmDraftsAction } from "./actions";

export default function DraftConfirmList({ drafts }: { drafts: Deal[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set(drafts.map((d) => d.id)));

  if (drafts.length === 0) return null;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.06] p-6 sm:p-8">
      <h2 className="text-lg font-bold">Cars ready for your confirmation</h2>
      <p className="mt-1 text-sm text-zinc-400">
        We pulled these from a source you submitted. Uncheck anything that&apos;s wrong, sold, or
        outdated, then confirm to publish the rest.
      </p>

      <form
        action={async (formData) => {
          await confirmDraftsAction(formData);
        }}
        className="mt-5 space-y-2"
      >
        {drafts.map((deal) => {
          const isChecked = checked.has(deal.id);
          return (
            <label
              key={deal.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-zinc-950/40 p-3.5"
            >
              <input
                type="hidden"
                name="draftId"
                value={deal.id}
              />
              {isChecked && <input type="hidden" name="keep" value={deal.id} />}
              <button
                type="button"
                onClick={() => toggle(deal.id)}
                className="shrink-0 text-white"
              >
                {isChecked ? <CheckSquare size={20} /> : <Square size={20} className="text-zinc-500" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{dealTitle(deal)}</p>
                <p className="text-xs text-zinc-500">
                  {deal.onePay
                    ? `${formatCurrency(deal.dueAtSigning)} one-pay`
                    : `${formatCurrency(deal.payment)}/mo`}
                  {" · "}
                  {formatCurrency(deal.dueAtSigning)} due at signing · {deal.term}mo
                </p>
              </div>
            </label>
          );
        })}

        <button
          type="submit"
          className="mt-3 rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
        >
          Confirm &amp; publish selected ({checked.size})
        </button>
      </form>
    </div>
  );
}
