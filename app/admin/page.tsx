import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { listAccounts } from "@/lib/admin-data";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

function weekAgoIso(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AdminOverviewPage() {
  await requireAdmin("/admin");
  const admin = createAdminClient();
  const weekAgo = weekAgoIso();
  const [accounts, live, convs, recentMessages] = await Promise.all([
    listAccounts(),
    admin.from("deals").select("id", { count: "exact", head: true }).eq("status", "published"),
    admin.from("conversations").select("id", { count: "exact", head: true }),
    admin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
  ]);
  const brokers = accounts.filter((a) => a.kind === "broker");
  const shoppers = accounts.filter((a) => a.kind === "shopper");
  const newThisWeek = accounts.filter((a) => a.signedUpAt >= weekAgo);

  const stats = [
    { label: "Brokers & dealers", value: brokers.length, href: "/admin/users" },
    { label: "Shoppers", value: shoppers.length, href: "/admin/users" },
    { label: "Sign-ups this week", value: newThisWeek.length, href: "/admin/users" },
    { label: "Live listings", value: live.count ?? 0, href: "/" },
    { label: "Conversations", value: convs.count ?? 0, href: "/admin/messages" },
    { label: "Messages this week", value: recentMessages.count ?? 0, href: "/admin/messages" },
  ];

  return (
    <main className="container-page py-8 sm:py-10">
      <h1 className="type-page text-3xl">Admin</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card-interactive p-4">
            <p className="label">{s.label}</p>
            <p className="stat-value mt-2">{s.value}</p>
          </Link>
        ))}
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="type-title">Latest sign-ups</h2>
          <Link href="/admin/users" className="link-arrow">
            All users <ArrowRight />
          </Link>
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {accounts.slice(0, 8).map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <span>
                <span className="font-medium text-fg">{a.kind === "admin" || a.name === "—" ? a.email : a.name}</span>
                <span className="ml-2 pill pill-neutral">
                  {a.kind === "broker" ? "Broker" : a.kind === "shopper" ? "Shopper" : a.kind === "admin" ? "Admin" : "Incomplete"}
                </span>
                <span className="ml-2 text-fg-muted">{a.email}</span>
              </span>
              <span className="text-xs text-fg-muted">{day(a.signedUpAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
