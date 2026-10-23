import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { DEAL_COLUMNS, PLACEHOLDER_IMAGE, mapRowToDeal } from "@/lib/supabase/deals";
import type { Deal } from "@/lib/deals-data";
import { dealTitle } from "@/lib/deal-utils";
import MyListings from "@/app/broker/dashboard/MyListings";
import RemovedListings from "@/app/broker/dashboard/RemovedListings";
import BrokerSelect from "./BrokerSelect";

export const metadata: Metadata = { title: "Listings", robots: { index: false } };
export const dynamic = "force-dynamic";

type Row = Parameters<typeof mapRowToDeal>[0];

function hasPhoto(d: Deal): boolean {
  return d.images.some((src) => src && src !== PLACEHOLDER_IMAGE);
}

// Every broker's listings, editable by admins with the same editor brokers
// use (fix a field, re-pull a photo, take a car down or bring it back).
// Cars show once a seller is picked (or a search / "no photo" filter is
// on); otherwise it's just the list of sellers to pick from.
export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ broker?: string; photo?: string; q?: string }>;
}) {
  await requireAdmin("/admin/listings");
  const { broker = "", photo = "", q = "" } = await searchParams;
  const admin = createAdminClient();

  const [{ data: rows, error }, { data: brokers }] = await Promise.all([
    admin
      .from("deals")
      .select(DEAL_COLUMNS)
      .in("status", ["published", "draft", "removed"])
      .order("created_at", { ascending: false })
      .limit(2000)
      .returns<Row[]>(),
    admin.from("brokers").select("id, business_name").order("business_name"),
  ]);
  if (error) console.error("admin listings: load failed:", error.message);

  const brokerName = new Map(((brokers ?? []) as { id: string; business_name: string }[]).map((b) => [b.id, b.business_name]));
  const query = q.trim().toLowerCase();
  const all = (rows ?? []).map(mapRowToDeal);
  const shown = all.filter(
    (d) =>
      (!broker || d.brokerId === broker) &&
      (photo !== "missing" || !hasPhoto(d)) &&
      (!query || dealTitle(d).toLowerCase().includes(query) || (d.sellerName ?? "").toLowerCase().includes(query))
  );

  // One section per broker, biggest inventory first.
  const groups = new Map<string, Deal[]>();
  for (const d of shown) groups.set(d.brokerId ?? "", [...(groups.get(d.brokerId ?? "") ?? []), d]);
  const sections = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const live = all.filter((d) => d.status === "published").length;
  const noPhoto = all.filter((d) => d.status !== "removed" && !hasPhoto(d)).length;
  const filtering = Boolean(broker || query || photo === "missing");

  // Every seller with listings, biggest first, for the picker and the list.
  const byBroker = new Map<string, Deal[]>();
  for (const d of all) byBroker.set(d.brokerId ?? "", [...(byBroker.get(d.brokerId ?? "") ?? []), d]);
  const sellers = [...byBroker.entries()]
    .map(([id, deals]) => {
      const active = deals.filter((d) => d.status !== "removed");
      return {
        id,
        name: brokerName.get(id) ?? deals[0]?.sellerName ?? "Unknown broker",
        live: active.filter((d) => d.status === "published").length,
        drafts: active.filter((d) => d.status === "draft").length,
        removed: deals.length - active.length,
        noPhoto: active.filter((d) => !hasPhoto(d)).length,
        count: active.length,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <main className="container-page py-8 sm:py-10">
      <h1 className="type-page text-3xl">Listings</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {`${live} live · ${noPhoto} without a photo. Edit any broker's car here — fix a field, re-pull a photo (expand a row), or take it down.`}
      </p>

      <form className="mt-5 flex flex-wrap items-end gap-3" action="/admin/listings">
        <label className="text-xs text-fg-muted">
          Broker
          <BrokerSelect value={broker} brokers={sellers} />
        </label>
        <label className="text-xs text-fg-muted">
          Search
          <input name="q" defaultValue={q} placeholder="e.g. X5, Urus" className="input input-sm mt-1 block" />
        </label>
        <label className="flex min-h-9 items-center gap-2 text-sm text-fg-secondary">
          <input type="checkbox" name="photo" value="missing" defaultChecked={photo === "missing"} className="checkbox" />
          No photo only
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">
          Apply
        </button>
        {(broker || photo || q) && (
          <Link href="/admin/listings" className="link-quiet text-sm">
            Clear
          </Link>
        )}
      </form>

      {!filtering && (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[3px] border border-line">
          {sellers.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/listings?broker=${encodeURIComponent(s.id)}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-hover"
              >
                <span className="font-medium text-fg">{s.name}</span>
                <span className="text-sm text-fg-muted">
                  {s.live} live
                  {s.drafts ? ` · ${s.drafts} draft${s.drafts === 1 ? "" : "s"}` : ""}
                  {s.removed ? ` · ${s.removed} removed` : ""}
                  {s.noPhoto ? ` · ${s.noPhoto} without a photo` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {filtering && sections.length === 0 && <p className="mt-8 text-sm text-fg-muted">No listings match.</p>}
      {filtering && (
        <div className="mt-8 space-y-12">
          {sections.map(([id, deals]) => {
            const active = deals.filter((d) => d.status !== "removed");
            const removed = deals.filter((d) => d.status === "removed");
            const drafts = active.filter((d) => d.status === "draft").length;
            return (
              <section key={id}>
                <h2 className="type-title">
                  {brokerName.get(id) ?? deals[0]?.sellerName ?? "Unknown broker"}{" "}
                  <span className="text-sm font-normal text-fg-muted">
                    {active.length - drafts} live{drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
                  </span>
                </h2>
                <div className="mt-3">
                  <MyListings deals={active} asAdmin emptyMessage="No active listings match." />
                </div>
                <RemovedListings deals={removed} asAdmin />
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
