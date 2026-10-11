// The signed-in shopper's sales tax rate, from the ZIP on their account
// (lib/sales-tax.ts). Signed-in shoppers only: anyone else gets 401.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { taxRateForZip } from "@/lib/sales-tax";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log in to see payments with tax." }, { status: 401 });
  const { data } = await supabase
    .from("customers")
    .select("zip_code")
    .eq("id", user.id)
    .maybeSingle<{ zip_code: string | null }>();
  if (!data) return NextResponse.json({ error: "Shopper accounts only." }, { status: 403 });
  return NextResponse.json(taxRateForZip(data.zip_code ?? ""), { headers: { "Cache-Control": "private, no-store" } });
}
