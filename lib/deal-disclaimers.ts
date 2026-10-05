// A broker's standard disclosures by make (brokers.deal_disclaimers, see
// supabase/migrations/0031_broker_deal_disclaimers.sql), added to the end
// of the description of each new car of that make. SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";

export type DealDisclaimers = Record<string, string>;

export async function getDealDisclaimers(brokerId: string): Promise<DealDisclaimers> {
  try {
    const { data, error } = await createAdminClient()
      .from("brokers")
      .select("deal_disclaimers")
      .eq("id", brokerId)
      .maybeSingle<{ deal_disclaimers: DealDisclaimers | null }>();
    if (error) {
      console.error("getDealDisclaimers failed:", error.message);
      return {};
    }
    return data?.deal_disclaimers ?? {};
  } catch (err) {
    console.error("getDealDisclaimers threw:", err);
    return {};
  }
}

// The notes with the make's disclosure added (once), or unchanged. Makes
// match loosely ("Mercedes" / "Mercedes-Benz").
export function withDisclaimer(notes: string | null | undefined, make: string, disclaimers: DealDisclaimers): string {
  const base = (notes ?? "").trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const key = Object.keys(disclaimers).find((k) => norm(make).startsWith(norm(k)) || norm(k).startsWith(norm(make)));
  const text = key ? disclaimers[key]?.trim() : "";
  if (!text || base.includes(text.split("\n")[0])) return base;
  return [base, text].filter(Boolean).join("\n\n");
}
