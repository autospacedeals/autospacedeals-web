import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { CHANNELS, getReturnMetrics, getTraction, type ReturnMetrics, type TractionMonth } from "@/lib/traction";
import CopyTable from "./CopyTable";

export const metadata: Metadata = { title: "Traction", robots: { index: false } };
export const dynamic = "force-dynamic";

const TH = "px-4 py-2.5 font-medium whitespace-nowrap";
const TD = "px-4 py-3 whitespace-nowrap tabular-nums";

function monthLabel(month: string, current: boolean): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return current ? `${label} (so far)` : label;
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

// "+40%" against the month before (blank for the first month or from zero).
function change(cur: number, prev: number | undefined): string {
  if (prev == null || prev === 0) return "";
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p >= 0 ? "+" : ""}${p}%`;
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs text-fg-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`${TD} ${j === 0 ? "font-medium text-fg" : "text-fg-secondary"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  title,
  intro,
  head,
  rows,
}: {
  title: string;
  intro: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="type-title">{title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">{intro}</p>
        </div>
        <CopyTable rows={[head, ...rows]} />
      </div>
      <Table head={head} rows={rows} />
    </section>
  );
}

// How often people come back: the share who returned on another day, how
// many days they visited, and how soon.
function ComingBack({ r }: { r: ReturnMetrics }) {
  const share = (n: number) => pct(n, r.visitors);
  const median = r.medianDaysToReturn;
  const cards = [
    { label: "Came back on another day", value: `${r.cameBack} of ${r.visitors}`, note: share(r.cameBack) },
    {
      label: "Typical time before coming back",
      value: median == null ? "—" : median < 1 ? "Same week" : `${Math.round(median)} day${Math.round(median) === 1 ? "" : "s"}`,
      note: "median, for people who came back",
    },
    { label: "Came back within 7 days", value: r.within7, note: share(r.within7) },
    { label: "Came back within 30 days", value: r.within30, note: share(r.within30) },
  ];
  const head = ["Days visited", "Visitors", "Share"];
  const rows: (string | number)[][] = [
    ["1 day (didn't come back yet)", r.days1, share(r.days1)],
    ["2 days", r.days2, share(r.days2)],
    ["3–5 days", r.days3to5, share(r.days3to5)],
    ["6+ days", r.days6plus, share(r.days6plus)],
  ];
  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="type-title">Coming back</h2>
          <p className="mt-1 max-w-3xl text-sm text-fg-muted">
            How often people return, all time. A visit is one browsing session; coming back means visiting again on a
            different day. A cleared browser or a second device counts as a new visitor, so these run a little low.
          </p>
        </div>
        <CopyTable rows={[["Measure", "Value", "Share"], ...cards.map((c) => [c.label, c.value, c.note]), [], head, ...rows]} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="label">{c.label}</p>
            <p className="mt-1.5 text-2xl font-semibold text-fg tabular-nums">{c.value}</p>
            <p className="mt-0.5 text-xs text-fg-muted">{c.note}</p>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Table head={head} rows={rows} />
      </div>
    </section>
  );
}

export default async function TractionPage() {
  await requireAdmin("/admin/traction");
  const [t, returns] = await Promise.all([getTraction(), getReturnMetrics()]);

  if (!t) {
    return (
      <main className="container-page py-8 sm:py-10">
        <h1 className="type-page text-3xl">Traction</h1>
        <p className="alert alert-danger mt-6">Couldn&apos;t load the numbers. Check the server logs.</p>
      </main>
    );
  }

  // Newest month first.
  const months = [...t.months].reverse();
  const prevOf = (m: TractionMonth) => t.months[t.months.indexOf(m) - 1];
  const label = (m: TractionMonth, i: number) => monthLabel(m.month, i === 0);
  const ch = (m: TractionMonth) => t.channels[m.month];

  const awareness = months.map((m, i) => {
    const direct = ch(m)?.direct ?? 0;
    return [
      label(m, i),
      m.visitors,
      change(m.visitors, prevOf(m)?.visitors),
      m.newVisitors,
      `${m.returningVisitors} (${pct(m.returningVisitors, m.visitors)})`,
      `${direct} (${pct(direct, m.visitors)})`,
      ch(m)?.ai ?? 0,
    ];
  });
  const found = months.map((m, i) => [label(m, i), ...CHANNELS.map((c) => ch(m)?.[c.key] ?? 0)]);
  const activity = months.map((m, i) => [
    label(m, i),
    m.listingViews,
    m.signups,
    m.savedDeals + m.savedSearches,
    m.conversations,
    m.messages,
    m.sold,
    m.sellersTotal,
    m.listingsAdded,
  ]);
  const top = (t.topSources[months[0]?.month] ?? []).slice(0, 8);

  const cards = [
    { label: "Live listings", value: t.now.liveListings.toLocaleString("en-US") },
    { label: "Sellers live", value: t.now.liveSellers },
    { label: "Car brands", value: t.now.makes },
    { label: "Shopper accounts", value: t.now.shoppers },
    { label: "People who've visited", value: t.now.visitorsAllTime.toLocaleString("en-US") },
  ];

  return (
    <main className="container-page py-8 sm:py-10">
      <h1 className="type-page text-3xl">Traction</h1>
      <p className="mt-2 max-w-3xl text-sm text-fg-muted">
        How many people know Drive and use it, month by month, for investors and for judging ads. Months are Pacific
        time; the current month is so far. Visitors are browsers (one person on two devices counts twice); the
        internal test seller and throwaway accounts are left out, our own visits aren&apos;t.
      </p>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <p className="label">{c.label}</p>
            <p className="mt-1.5 text-2xl font-semibold text-fg tabular-nums">{c.value}</p>
          </div>
        ))}
      </section>

      <Section
        title="Brand awareness"
        intro="Direct visitors came straight to idriveus.com (typed it, a bookmark, or someone told them): the clearest sign people know the name. Returning visitors came back on another day or month."
        head={["Month", "Visitors", "vs. last month", "New", "Returning", "Direct", "From AI assistants"]}
        rows={awareness}
      />

      {returns && returns.visitors > 0 && <ComingBack r={returns} />}

      <Section
        title="How people found Drive"
        intro={CHANNELS.map((c) => `${c.label}: ${c.hint.toLowerCase()}`).join(" · ")}
        head={["Month", ...CHANNELS.map((c) => c.label)]}
        rows={found}
      />

      {top.length > 0 && (
        <p className="mt-3 text-xs text-fg-muted">
          This month&apos;s top sources: {top.map((s) => `${s.source} (${s.visitors})`).join(", ")}
        </p>
      )}

      <Section
        title="Marketplace activity"
        intro="What visitors do: view listings, sign up, save deals and searches, and message sellers. Closed deals count once sellers mark a conversation sold."
        head={["Month", "Listing views", "Sign-ups", "Saves", "Conversations", "Messages", "Closed deals", "Sellers (total)", "Listings added"]}
        rows={activity}
      />
    </main>
  );
}
