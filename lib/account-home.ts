// Where a signed-in account belongs: the admin queue, the broker dashboard
// (only for accounts with a brokers row), or the shopper dashboard.
// Server-only — pass the request's Supabase client.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";

export async function accountHome(supabase: SupabaseClient, user: Pick<User, "id" | "email">): Promise<string> {
  if (isAdminEmail(user.email)) return "/admin/submissions";
  const { data: broker } = await supabase.from("brokers").select("id").eq("id", user.id).maybeSingle();
  return broker ? "/broker/dashboard" : "/customer/dashboard";
}
