// Light vs dark for the admin Leads page: each visitor in the period is
// counted once, in the mode they were last seen in, from the mode their
// visits loaded in (site_visits.theme, 0058) and their toggle picks
// (theme_choices, 0052), whichever is newer. Visitors with neither (visits
// from before 0058) aren't counted. SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";

export interface ThemeStats {
  light: number;
  dark: number;
}

const DAY = 24 * 60 * 60 * 1000;

export async function getThemeStats(days: number | null): Promise<ThemeStats> {
  const admin = createAdminClient();
  const since = days ? new Date(Date.now() - days * DAY).toISOString() : null;
  let visits = admin
    .from("site_visits")
    .select("visitor, theme, created_at")
    .not("theme", "is", null)
    .order("created_at", { ascending: true })
    .limit(50000);
  let picks = admin
    .from("theme_choices")
    .select("visitor, theme, created_at")
    .order("created_at", { ascending: true })
    .limit(20000);
  if (since) {
    visits = visits.gte("created_at", since);
    picks = picks.gte("created_at", since);
  }
  type Row = { visitor: string; theme: string; created_at: string };
  const [v, p] = await Promise.all([visits.returns<Row[]>(), picks.returns<Row[]>()]);
  // Before the migrations have been run there's simply less to show.
  const rows = [...(v.error ? [] : v.data ?? []), ...(p.error ? [] : p.data ?? [])].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1
  );
  const latest = new Map<string, string>();
  for (const r of rows) latest.set(r.visitor, r.theme);
  const modes = [...latest.values()];
  return { light: modes.filter((t) => t === "light").length, dark: modes.filter((t) => t === "dark").length };
}
