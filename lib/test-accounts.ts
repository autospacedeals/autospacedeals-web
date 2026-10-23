// Accounts and sellers the Leads page leaves out of its numbers: shopper
// accounts flagged is_test (migration 0054) and the internal "test" broker.
// SERVER-ONLY (service role).
import type { createAdminClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createAdminClient>;

// The internal seller used for trying the site out.
export const isInternalSeller = (name: string | null) =>
  !name || name.toLowerCase() === "test" || /\(delete me\)/i.test(name);

// Ids of test shopper accounts; empty until migration 0054 has run.
export async function testCustomerIds(admin: Admin): Promise<Set<string>> {
  const { data, error } = await admin.from("customers").select("id").eq("is_test", true).returns<{ id: string }[]>();
  if (error) return new Set();
  return new Set((data ?? []).map((c) => c.id));
}
