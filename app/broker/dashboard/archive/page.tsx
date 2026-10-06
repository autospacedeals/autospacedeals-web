import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { changeLabel, getAdVersions } from "@/lib/ad-archive";
import { formatCurrency } from "@/lib/deal-utils";

export const metadata: Metadata = { title: "Ad archive", robots: { index: false } };
export const dynamic = "force-dynamic";

const SHOWN = 300;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

const money = (v: number | null) => (v == null ? "—" : formatCurrency(v));
const TH = "px-3 py-2.5 font-medium";
const TD = "px-3 py-2.5 whitespace-nowrap";

// Every version of the seller's listings as shoppers saw them, kept for
// California's CARS Act (dealers keep 2 years of online ads).
export default async function AdArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login?next=/broker/dashboard/archive");

  const rows = await getAdVersions(supabase, user.id, SHOWN);

  return (
    <main className="container-page py-10 sm:py-12">
      <Link href="/broker/dashboard" className="link-arrow mb-6 min-h-9">
        <ArrowLeft /> Dashboard
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="type-page text-3xl">Ad archive</h1>
          <p className="mt-2 text-sm text-fg-secondary">
            A dated copy of each of your listings every time it was posted, changed, taken down or deleted, whether
            you edited it here or it came from your sheet. California&apos;s CARS Act has dealers keep 2 years of
            online ads; Drive keeps these for you automatically.
          </p>
        </div>
        <a href="/broker/dashboard/archive/csv" className="btn btn-secondary btn-sm">
          <Download /> Download all (CSV)
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-fg-muted">Nothing archived yet. Your listings will show up here.</p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-surface text-xs text-fg-muted">
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Change</th>
                <th className={TH}>Car</th>
                <th className={TH}>Payment</th>
                <th className={TH}>Due at signing</th>
                <th className={TH}>Term / miles</th>
                <th className={TH}>Total price</th>
                <th className={TH}>MSRP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${TD} text-fg-secondary`}>{when(r.recordedAt)}</td>
                  <td className={TD}>
                    {changeLabel(r.change)}
                    {r.status && r.status !== "published" && r.change !== "deleted" && (
                      <span className="ml-1.5 text-xs text-fg-muted">({r.status})</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-fg">{r.car || "—"}</td>
                  <td className={TD}>{r.onePay ? "One-pay" : `${money(r.payment)}/mo`}</td>
                  <td className={TD}>{money(r.dueAtSigning)}</td>
                  <td className={TD}>
                    {r.term ? `${r.term} mo` : "—"}
                    {r.milesPerYear ? ` · ${r.milesPerYear.toLocaleString("en-US")} mi` : ""}
                  </td>
                  <td className={TD}>{money(r.totalPrice)}</td>
                  <td className={TD}>{money(r.msrp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length >= SHOWN && (
        <p className="mt-3 text-xs text-fg-muted">
          Showing the latest {SHOWN}. The CSV download has every version.
        </p>
      )}
    </main>
  );
}
