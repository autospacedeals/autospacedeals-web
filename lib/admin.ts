// Who can use the /admin pages (users, every conversation, submissions,
// managing admins). SERVER-ONLY.
//
// Admins live in the `admins` table (supabase/migrations/0026_admins.sql)
// and add/remove each other at /admin/admins. OWNER_EMAILS are always
// admins as well — a fallback so a mistake on that page (or the table not
// existing yet) can never lock everyone out.
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const OWNER_EMAILS = ["mheryanrobert@gmail.com"];

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

// Once per request: every admin email (owners + table).
export const adminEmails = cache(async (): Promise<Set<string>> => {
  const emails = new Set(OWNER_EMAILS.map(normalizeEmail));
  try {
    const { data, error } = await createAdminClient().from("admins").select("email");
    if (error) console.error("admins lookup failed:", error.message);
    for (const row of (data ?? []) as { email: string }[]) emails.add(normalizeEmail(row.email));
  } catch (err) {
    console.error("admins lookup threw:", err);
  }
  return emails;
});

export async function isAdminEmail(email: string | null | undefined): Promise<boolean> {
  const e = normalizeEmail(email);
  if (!e) return false;
  return (await adminEmails()).has(e);
}

// For admin pages and actions: the signed-in admin, or off to the admin login.
export async function requireAdmin(next = "/admin"): Promise<{ id: string; email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdminEmail(user.email))) {
    redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  }
  return { id: user.id, email: normalizeEmail(user.email) };
}
