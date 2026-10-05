// Small helpers about a signed-in account, shared by the dashboards and
// app/account/actions.ts.
import type { User } from "@supabase/supabase-js";

// Accounts that signed up with Google have no password until they add one.
export function hasPasswordLogin(user: Pick<User, "app_metadata">): boolean {
  const providers = user.app_metadata?.providers;
  return Array.isArray(providers) ? providers.includes("email") : true;
}
