"use server";

import { requireAdmin } from "@/lib/admin";
import { fetchGoogleSheetTabs } from "@/lib/google-sheet";

// Admin check of a sheet link: can the site read it, and what's on it.
export async function checkSheetAction(
  _prev: { error: string | null; tabs?: { name: string; rows: number }[] },
  formData: FormData
): Promise<{ error: string | null; tabs?: { name: string; rows: number }[] }> {
  await requireAdmin("/admin/google-reader");
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "Paste a Google Sheet link." };
  const result = await fetchGoogleSheetTabs(url);
  if (!result.ok) return { error: result.error };
  return { error: null, tabs: result.tabs.map((t) => ({ name: t.name, rows: t.rows.length })) };
}
