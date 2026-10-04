import type { Metadata } from "next";
import { OWNER_EMAILS, normalizeEmail, requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import AdminsManager from "./AdminsManager";

export const metadata: Metadata = { title: "Admins", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  const me = await requireAdmin("/admin/admins");
  const { data, error } = await createAdminClient()
    .from("admins")
    .select("email, added_by, created_at")
    .order("created_at", { ascending: true });
  if (error) console.error("admins list failed:", error.message);

  const owners = OWNER_EMAILS.map(normalizeEmail);
  const rows = ((data ?? []) as { email: string; added_by: string | null; created_at: string }[]).filter(
    (r) => !owners.includes(r.email)
  );
  const admins = [
    ...owners.map((email) => ({ email, addedBy: null, addedAt: null, owner: true })),
    ...rows.map((r) => ({ email: r.email, addedBy: r.added_by, addedAt: r.created_at, owner: false })),
  ];

  return (
    <main className="container-page max-w-3xl py-8 sm:py-10">
      <h1 className="type-page text-3xl">Admins</h1>
      <p className="mt-2 mb-6 text-sm text-fg-muted">
        Admins can see every user, every conversation and the submission queue, and add or remove other admins.
      </p>
      {error ? (
        <p className="alert alert-danger">
          The admin list isn&apos;t set up yet — run supabase/migrations/0026_admins.sql in Supabase.
        </p>
      ) : (
        <AdminsManager admins={admins} myEmail={me.email} />
      )}
    </main>
  );
}
