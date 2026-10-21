// Light/dark toggle use for the admin Leads page (theme_choices, 0052):
// how many shoppers switched to light mode in the period, and how many of
// them are still on it (their latest pick). SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";

export interface ThemeStats {
  // Visitors who picked light at least once in the period.
  triedLight: number;
  // ...whose latest pick is still light.
  stayedLight: number;
}

export async function getThemeStats(days: number | null): Promise<ThemeStats> {
  let query = createAdminClient()
    .from("theme_choices")
    .select("visitor, theme, created_at")
    .order("created_at", { ascending: true })
    .limit(20000);
  if (days) query = query.gte("created_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
  const { data, error } = await query.returns<{ visitor: string; theme: string; created_at: string }[]>();
  // Before the migration has been run there's simply nothing to show.
  if (error) return { triedLight: 0, stayedLight: 0 };
  const tried = new Set<string>();
  const latest = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.theme === "light") tried.add(r.visitor);
    latest.set(r.visitor, r.theme);
  }
  return { triedLight: tried.size, stayedLight: [...latest.values()].filter((t) => t === "light").length };
}
