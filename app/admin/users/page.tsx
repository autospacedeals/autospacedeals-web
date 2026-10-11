import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { listAccounts, type AdminAccount } from "@/lib/admin-data";
import { DMV_LICENSE_LOOKUP_URL, verificationSteps } from "@/lib/seller-verification";
import { approveSellerAction, decideAssistantRequestAction } from "./actions";
import { listPendingAssistantRequests, type PendingAssistantRequest } from "@/lib/listing-assistant-store";

export const metadata: Metadata = { title: "Users", robots: { index: false } };
export const dynamic = "force-dynamic";

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never";
}

// "Today, 3:42 PM" / "Yesterday" / "Oct 4, 2026" (Pacific time).
function seen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const tz = "America/Los_Angeles";
  const dayOf = (x: Date) => x.toLocaleDateString("en-US", { timeZone: tz });
  const now = new Date();
  if (dayOf(d) === dayOf(now)) return `Today, ${d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })}`;
  if (dayOf(d) === dayOf(new Date(now.getTime() - 86400000))) return "Yesterday";
  return d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
}

function Activity({ a }: { a: AdminAccount }) {
  const parts: string[] = [];
  if (a.kind === "broker") {
    parts.push(`${a.liveListings} live`);
    if (a.draftListings) parts.push(`${a.draftListings} draft${a.draftListings === 1 ? "" : "s"}`);
  } else if (a.kind === "shopper") {
    if (a.savedDeals) parts.push(`${a.savedDeals} saved deal${a.savedDeals === 1 ? "" : "s"}`);
    if (a.savedSearches) parts.push(`${a.savedSearches} saved search${a.savedSearches === 1 ? "" : "es"}`);
  }
  return (
    <span className="text-fg-muted">
      {parts.join(" · ") || "—"}
      {a.conversations > 0 && (
        <>
          {parts.length > 0 && " · "}
          <Link href={`/admin/messages?account=${a.id}`} className="link">
            {a.conversations} conversation{a.conversations === 1 ? "" : "s"}
          </Link>
        </>
      )}
    </span>
  );
}

function AccountTable({ accounts, kind }: { accounts: AdminAccount[]; kind: AdminAccount["kind"] }) {
  if (accounts.length === 0) return <p className="text-sm text-fg-muted">None yet.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-surface text-xs text-fg-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{kind === "broker" ? "Business" : "Name"}</th>
            <th className="px-4 py-2.5 font-medium">Email</th>
            <th className="px-4 py-2.5 font-medium">Phone</th>
            <th className="px-4 py-2.5 font-medium">{kind === "broker" ? "Location" : "Zip"}</th>
            <th className="px-4 py-2.5 font-medium">Signed up</th>
            <th className="px-4 py-2.5 font-medium">Last on site</th>
            <th className="px-4 py-2.5 font-medium">Activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {accounts.map((a) => (
            <tr key={a.id} className="align-top">
              <td className="px-4 py-3">
                <span className="font-medium text-fg">
                  {kind === "broker" ? (
                    <Link href={`/brokers/${a.id}`} className="link-quiet">
                      {a.name}
                    </Link>
                  ) : (
                    a.name
                  )}
                </span>
                {a.contactName && <span className="block text-xs text-fg-muted">{a.contactName}</span>}
                {kind === "broker" && !a.approvedAt && <span className="block text-xs text-warning">not verified yet</span>}
                <span className="block text-xs text-fg-faint">via {a.via}</span>
              </td>
              <td className="px-4 py-3 break-all">
                <a href={`mailto:${a.email}`} className="link-quiet">
                  {a.email}
                </a>
                {!a.emailConfirmed && <span className="block text-xs text-warning">email not confirmed</span>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {a.phone ? (
                  <a href={`tel:${a.phone.replace(/\D/g, "")}`} className="link-quiet">
                    {a.phone}
                  </a>
                ) : (
                  <span className="text-fg-faint">—</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-fg-secondary">{a.location.replace(/^zip /, "")}</td>
              <td className="px-4 py-3 whitespace-nowrap text-fg-secondary">{day(a.signedUpAt)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-fg-secondary">{seen(a.lastSeenAt)}</td>
              <td className="px-4 py-3">
                <Activity a={a} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// New brokers and salespeople whose listings stay hidden until their DMV
// license is checked and they're approved.
function PendingSellers({ sellers }: { sellers: AdminAccount[] }) {
  return (
    <div className="space-y-3">
      {sellers.map((a) => (
        <div key={a.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-fg">
              {a.name}
              <span className="ml-2 text-xs font-normal text-fg-muted">
                {a.sellerType === "Salesperson" ? `Salesperson at ${a.dealershipName ?? "?"}` : "Broker"}
              </span>
            </p>
            <p className="mt-1 text-fg-secondary">
              DMV license: <span className="font-mono text-fg">{a.licenseNumber || "not given"}</span>
            </p>
            <p className="mt-1 text-fg-muted">
              {[a.contactName, a.email, a.phone, a.location].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-fg-muted">
              {`Signed up ${day(a.signedUpAt)} · ${a.liveListings} listing${a.liveListings === 1 ? "" : "s"} waiting`}
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-fg-muted">{verificationSteps(a.sellerType ?? "Broker")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <a href={DMV_LICENSE_LOOKUP_URL} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              DMV lookup
            </a>
            <form action={approveSellerAction}>
              <input type="hidden" name="brokerId" value={a.id} />
              <button type="submit" className="btn btn-primary btn-sm">
                Approve
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

// Sellers out of listing assistant messages for the day who asked for more.
function AssistantRequests({ requests }: { requests: PendingAssistantRequest[] }) {
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-fg">{r.businessName}</p>
            <p className="mt-1 text-fg-muted">
              {`Asked ${seen(r.createdAt)} · ${r.usedToday} message${r.usedToday === 1 ? "" : "s"} in the last 24 hours`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <form action={decideAssistantRequestAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="decision" value="deny" />
              <button type="submit" className="btn btn-secondary btn-sm">
                Deny
              </button>
            </form>
            <form action={decideAssistantRequestAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <input type="hidden" name="decision" value="approve" />
              <button type="submit" className="btn btn-primary btn-sm">
                Approve 40 more
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

// Every account on the site — brokers, shoppers, and sign-ups that never
// finished a profile — with contact details and what they've done.
export default async function AdminUsersPage() {
  await requireAdmin("/admin/users");
  const [accounts, assistantRequests] = await Promise.all([listAccounts(), listPendingAssistantRequests()]);
  const brokers = accounts.filter((a) => a.kind === "broker");
  const pending = brokers.filter((a) => !a.approvedAt);
  const shoppers = accounts.filter((a) => a.kind === "shopper");
  const incomplete = accounts.filter((a) => a.kind === "incomplete");
  const adminAccounts = accounts.filter((a) => a.kind === "admin");

  return (
    <main className="container-page py-8 sm:py-10">
      <h1 className="type-page text-3xl">Users</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {`${accounts.length} accounts · newest first. Click a conversation count to read that account's messages.`}
      </p>

      {pending.length > 0 && (
        <section className="mt-8">
          <h2 className="type-title mb-1">Waiting for verification ({pending.length})</h2>
          <p className="mb-3 text-sm text-fg-muted">
            Their listings are hidden from shoppers until you approve them. Approving emails them and makes their cars
            public.
          </p>
          <PendingSellers sellers={pending} />
        </section>
      )}

      {assistantRequests.length > 0 && (
        <section id="assistant-requests" className="mt-8">
          <h2 className="type-title mb-1">Listing assistant requests ({assistantRequests.length})</h2>
          <p className="mb-3 text-sm text-fg-muted">
            They used all their assistant messages for the day. Approving gives them 40 more for the next 24 hours and
            emails them.
          </p>
          <AssistantRequests requests={assistantRequests} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="type-title mb-3">Brokers & dealers ({brokers.length})</h2>
        <AccountTable accounts={brokers} kind="broker" />
      </section>

      <section className="mt-10">
        <h2 className="type-title mb-3">Shoppers ({shoppers.length})</h2>
        <AccountTable accounts={shoppers} kind="shopper" />
      </section>

      {adminAccounts.length > 0 && (
        <section className="mt-10">
          <h2 className="type-title mb-3">Admin accounts ({adminAccounts.length})</h2>
          <AccountTable accounts={adminAccounts} kind="admin" />
        </section>
      )}

      {incomplete.length > 0 && (
        <section className="mt-10">
          <h2 className="type-title mb-1">Didn&apos;t finish signing up ({incomplete.length})</h2>
          <p className="mb-3 text-sm text-fg-muted">
            Created a login but no shopper or broker profile (e.g. stopped at the Google &quot;finish your account&quot;
            step).
          </p>
          <AccountTable accounts={incomplete} kind="incomplete" />
        </section>
      )}
    </main>
  );
}
