"use server";

// Changing the ZIP a shopper's payments are taxed at — the same ZIP as on
// their account (it's where the car would be registered), so this updates
// their profile too.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { taxRateForZip, type ZipTaxRate } from "@/lib/sales-tax";

export async function setTaxZipAction(zip: string): Promise<{ error: string | null; info?: ZipTaxRate }> {
  const clean = String(zip ?? "").trim();
  if (!/^\d{5}$/.test(clean)) return { error: "Enter a 5-digit ZIP code." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to change your ZIP." };
  const { data, error } = await supabase
    .from("customers")
    .update({ zip_code: clean })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: "Couldn't save your ZIP. Please try again." };
  if (!data) return { error: "Shopper accounts only." };
  revalidatePath("/customer/dashboard");
  return { error: null, info: taxRateForZip(clean) };
}
