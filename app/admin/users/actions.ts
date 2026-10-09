"use server";

// Approving a new broker or dealership salesperson once their DMV license
// checks out (supabase/migrations/0038_seller_verification.sql). Their
// listings become public the moment approved_at is set.
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { emailSellerApproved } from "@/lib/seller-verification";

export async function approveSellerAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/users");
  const id = String(formData.get("brokerId") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  const { data: broker, error } = await admin
    .from("brokers")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", id)
    .is("approved_at", null)
    .select("contact_name, business_name")
    .maybeSingle<{ contact_name: string | null; business_name: string }>();
  if (error) {
    console.error("approveSeller failed:", error.message);
    return;
  }
  if (!broker) return; // already approved

  // Cars they posted while waiting count as just listed from today.
  const { data: live } = await admin
    .from("deals")
    .update({ date_posted: new Date().toISOString().slice(0, 10) })
    .eq("broker_id", id)
    .eq("status", "published")
    .select("id");

  const email = (await admin.auth.admin.getUserById(id)).data.user?.email ?? "";
  const name = broker.contact_name || broker.business_name;
  after(() => emailSellerApproved(email, name, live?.length ?? 0));

  revalidatePath("/admin/users");
  revalidatePath("/");
}
