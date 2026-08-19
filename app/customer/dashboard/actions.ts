"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileEditState = { error: string | null };

// Uploads a replacement document to the customer's own folder in the
// private customer-uploads bucket. Uses the session-bound client (not the
// admin client) since — unlike signup — there's always an active session
// here, so the "customers can upload their own documents" RLS policy
// applies normally. Returns the storage path, or null if no new file was
// selected (an empty <input type="file"> still submits, just with size 0).
async function uploadDocument(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File | null,
  label: "license" | "insurance"
): Promise<{ path: string | null; error: string | null }> {
  if (!file || file.size === 0) return { path: null, error: null };

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${label}.${ext}`;

  const { error } = await supabase.storage
    .from("customer-uploads")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export async function updateCustomerProfileAction(formData: FormData): Promise<ProfileEditState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/customer/login");

  const address = String(formData.get("address") || "").trim() || null;
  const currentVehicle = String(formData.get("currentVehicle") || "").trim() || null;
  const licenseFile = formData.get("driversLicense") as File | null;
  const insuranceFile = formData.get("insuranceCard") as File | null;

  const [license, insurance] = await Promise.all([
    uploadDocument(supabase, user.id, licenseFile, "license"),
    uploadDocument(supabase, user.id, insuranceFile, "insurance"),
  ]);
  if (license.error) return { error: license.error };
  if (insurance.error) return { error: insurance.error };

  // Only overwrite the stored path if a new file actually came in — leave
  // whatever's already on file untouched otherwise.
  const update: Record<string, string | null> = { address, current_vehicle: currentVehicle };
  if (license.path) update.drivers_license_path = license.path;
  if (insurance.path) update.insurance_card_path = insurance.path;

  const { error } = await supabase.from("customers").update(update).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/customer/dashboard");
  return { error: null };
}
