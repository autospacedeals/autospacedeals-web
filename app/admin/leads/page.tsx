import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { getLeadStats, type LocationStats } from "@/lib/lead-stats";
import { OUTCOMES_ENABLED, OUTCOME_LABELS, isLeadOutcome } from "@/lib/leads";

export const metadata: Metadata = { title: "Leads", robots: { index: false } };
export const dynamic = "force-dynamic";

const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];

function duration(ms: number | null): string {
  if (ms == null) return "—";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const hr = ms / 3600000;
  if (hr < 48) return `${hr < 10 ? hr.toFixed(1) : Math.round(hr)} hr`;
  return `${Math.round(hr / 24)} days`;
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

function OutcomePill({ outcome }: { outcome: string | null }) {
  if (!outcome || !isLeadOutcome(outcome)) return <span className="text-fg-faint">Not marked</span>;
  const cls = outcome === "sold" ? "pill-success" : outcome === "lost" ? "pill-neutral" : "pill-warning";
  return <span className={`pill ${cls}`}>{OUTCOME_LABELS[outcome]}</span>;
}

const TH = "px-4 py-2.5 font-medium";
const TD = "px-4 py-3 whitespace-nowrap";
const LOCATION_ROWS = 15;

function LocationTable({ title, rows }: { title: string; rows: LocationStats[] }) {
  const shown = rows.slice(0, LOCATION_ROWS);
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs text-fg-muted">
          <tr>
            <th className={TH}>{title}</th>
            <th className={TH}>Visitors</th>
            <th className={TH}>Listing views</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-3 text-fg-muted">
                Nothing yet.
              </td>
            </tr>
          )}
          {shown.map((r) => (
            <tr key={r.key}>
              <td className={`${TD} font-medium text-fg`}>{r.key}</td>
              <td className={TD}>{r.visitors}</td>
              <td className={TD}>{r.listingViews}</td>
            </tr>
          ))}
          {rows.length > LOCATION_ROWS && (
            <tr>
              <td colSpan={3} className="px-4 py-2.5 text-xs text-fg-muted">
                + {rows.length - LOCATION_ROWS} more
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Where shoppers come from, how fast brokers answer them, and what sold —
// for judging ads and brokers (lib/lead-stats.ts).
export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin("/admin/leads");
  const { days: raw } = await searchParams;
  const days = PERIODS.some((p) => p.value === raw) ? raw! : "30";
  const stats = await getLeadStats(days === "all" ? null : Number(days));
  const t = stats.totals;

  const tiles = [
    { label: "Visitors", value: t.visitors },
    { label: "Listing views", value: t.listingViews },
    { label: "Shopper sign-ups", value: t.signups },
    { label: "Conversations", value: t.conversations },
    { label: "Broker replied", value: t.replied, note: pct(t.replied, t.conversations) },
    ...(OUTCOMES_ENABLED ? [{ label: "Sold", value: t.sold, note: pct(t.sold, t.conversations) }] : []),
  ];
  const brokerCols = OUTCOMES_ENABLED ? 11 : 7;

  return (
    <main className="container-page py-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-page text-3xl">Leads</h1>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            Where shoppers come from and how fast brokers answer them.
            {OUTCOMES_ENABLED &&
              " Sales come from brokers marking each conversation (on the conversation page, or the daily check-in email)."}{" "}
            Broker and admin visits aren&apos;t counted.
          </p>
        </div>
        <nav aria-label="Period" className="flex gap-1">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={`/admin/leads?days=${p.value}`}
              aria-current={p.value === days ? "page" : undefined}
              className="btn btn-ghost btn-sm aria-[current=page]:bg-hover aria-[current=page]:text-fg"
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      {!stats.ready && (
        <p className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm text-warning">
          Lead tracking isn&apos;t set up in the database yet (migration 0033).
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="label">{s.label}</p>
            <p className="stat-value mt-2">
              {s.value}
              {s.note && <span className="ml-2 text-sm font-normal text-fg-muted">{s.note}</span>}
            </p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="type-title mb-1">By source</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Tag ad links so they show up here by name, e.g.{" "}
          <code className="break-all text-fg-secondary">idriveus.com/?utm_source=instagram-ads&amp;utm_campaign=oct-test</code>
          . Untagged visits are grouped by the site that sent them.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface text-xs text-fg-muted">
              <tr>
                <th className={TH}>Source</th>
                <th className={TH}>Visitors</th>
                <th className={TH}>Listing views</th>
                <th className={TH}>Sign-ups</th>
                <th className={TH}>Conversations</th>
                {OUTCOMES_ENABLED && <th className={TH}>Sold</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stats.sources.length === 0 && (
                <tr>
                  <td colSpan={OUTCOMES_ENABLED ? 6 : 5} className="px-4 py-3 text-fg-muted">
                    Nothing yet.
                  </td>
                </tr>
              )}
              {stats.sources.map((s) => (
                <tr key={s.key}>
                  <td className={`${TD} font-medium text-fg`}>{s.key}</td>
                  <td className={TD}>{s.visitors}</td>
                  <td className={TD}>{s.listingViews}</td>
                  <td className={TD}>{s.signups}</td>
                  <td className={TD}>
                    {s.conversations}
                    <span className="ml-1.5 text-xs text-fg-muted">{s.visitors ? pct(s.conversations, s.visitors) : ""}</span>
                  </td>
                  {OUTCOMES_ENABLED && <td className={TD}>{s.sold}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="type-title mb-1">By location</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Approximate, from each visitor&apos;s internet connection — phones on cell data and people on VPNs can show
          up as a nearby or different city.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <LocationTable title="State / country" rows={stats.states} />
          <LocationTable title="City" rows={stats.cities} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="type-title mb-1">By broker</h2>
        <p className="mb-3 text-sm text-fg-muted">
          Reply time is from the shopper&apos;s first message to the broker&apos;s first answer. &ldquo;Waiting&rdquo; means the
          shopper wrote last, over an hour ago.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface text-xs text-fg-muted">
              <tr>
                <th className={TH}>Broker</th>
                <th className={TH}>Listing views</th>
                <th className={TH}>Conversations</th>
                <th className={TH}>Replied</th>
                <th className={TH}>Median reply</th>
                <th className={TH}>Within 1 hr</th>
                <th className={TH}>Waiting</th>
                {OUTCOMES_ENABLED && (
                  <>
                    <th className={TH}>Sold</th>
                    <th className={TH}>Working</th>
                    <th className={TH}>Didn&apos;t buy</th>
                    <th className={TH}>Not marked</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stats.brokers.length === 0 && (
                <tr>
                  <td colSpan={brokerCols} className="px-4 py-3 text-fg-muted">
                    Nothing yet.
                  </td>
                </tr>
              )}
              {stats.brokers.map((b) => (
                <tr key={b.id}>
                  <td className={`${TD} font-medium text-fg`}>
                    <Link href={`/admin/messages?account=${b.id}`} className="link-quiet">
                      {b.name}
                    </Link>
                  </td>
                  <td className={TD}>{b.listingViews}</td>
                  <td className={TD}>{b.conversations}</td>
                  <td className={TD}>{pct(b.replied, b.conversations)}</td>
                  <td className={TD}>{duration(b.medianReplyMs)}</td>
                  <td className={TD}>{pct(b.within1h, b.conversations)}</td>
                  <td className={`${TD} ${b.waiting ? "font-medium text-danger" : ""}`}>{b.waiting}</td>
                  {OUTCOMES_ENABLED && (
                    <>
                      <td className={TD}>{b.sold}</td>
                      <td className={TD}>{b.working}</td>
                      <td className={TD}>{b.lost}</td>
                      <td className={`${TD} text-fg-muted`}>{b.unmarked}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="type-title mb-3">Most viewed listings</h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-surface text-xs text-fg-muted">
              <tr>
                <th className={TH}>Car</th>
                <th className={TH}>Views</th>
                <th className={TH}>Conversations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stats.topListings.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-fg-muted">
                    Nothing yet.
                  </td>
                </tr>
              )}
              {stats.topListings.map((l) => (
                <tr key={l.dealId}>
                  <td className={`${TD} text-fg`}>{l.title}</td>
                  <td className={TD}>{l.views}</td>
                  <td className={TD}>{l.conversations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="type-title mb-3">Latest conversations</h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-surface text-xs text-fg-muted">
              <tr>
                <th className={TH}>Started</th>
                <th className={TH}>Shopper</th>
                <th className={TH}>Broker</th>
                <th className={TH}>Car</th>
                <th className={TH}>Source</th>
                <th className={TH}>First reply</th>
                {OUTCOMES_ENABLED && <th className={TH}>Outcome</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stats.recent.length === 0 && (
                <tr>
                  <td colSpan={OUTCOMES_ENABLED ? 7 : 6} className="px-4 py-3 text-fg-muted">
                    No conversations yet.
                  </td>
                </tr>
              )}
              {stats.recent.map((l) => (
                <tr key={l.id}>
                  <td className={`${TD} text-fg-secondary`}>
                    <Link href={`/admin/messages/${l.id}`} className="link-quiet">
                      {day(l.createdAt)}
                    </Link>
                  </td>
                  <td className={`${TD} text-fg`}>{l.shopper}</td>
                  <td className={TD}>{l.broker}</td>
                  <td className="px-4 py-3">{l.car}</td>
                  <td className={`${TD} text-fg-secondary`}>{l.source}</td>
                  <td className={TD}>
                    {l.replyMs != null ? (
                      duration(l.replyMs)
                    ) : (
                      <span className={l.waiting ? "font-medium text-danger" : "text-fg-muted"}>No reply yet</span>
                    )}
                  </td>
                  {OUTCOMES_ENABLED && (
                    <td className={TD}>
                      <OutcomePill outcome={l.outcome} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
