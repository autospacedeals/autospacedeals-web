"use server";

import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export type AuthState = {
  error: string | null;
  needsConfirmation?: boolean;
};

export async function signInAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/customer/dashboard");
}

// Uploads a single optional document (driver's license or insurance/AAA
// card) to the private customer-uploads bucket, namespaced by user id like
// broker-uploads. Uses the admin client so this works even when there's no
// session yet (email confirmation pending) — same reasoning as the profile
// insert below. Returns the storage path, or null if no file was provided.
async function uploadCustomerDocument(
  userId: string,
  file: File | null,
  label: "license" | "insurance"
): Promise<string | null> {
  if (!file || file.size === 0) return null;

  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/${label}.${ext}`;

  const { error } = await admin.storage
    .from("customer-uploads")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (error) {
    console.error(`uploadCustomerDocument (${label}) failed:`, error.message);
    return null;
  }
  return path;
}

export async function signUpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const zipCode = String(formData.get("zipCode") || "").trim();
  const address = String(formData.get("address") || "").trim() || null;
  const currentVehicle = String(formData.get("currentVehicle") || "").trim() || null;
  const licenseFile = formData.get("driversLicense") as File | null;
  const insuranceFile = formData.get("insuranceCard") as File | null;

  if (!email || !password || !firstName || !lastName || !zipCode) {
    return { error: "Please fill in your name, email, password, and zip code." };
  }
  if (!/^\d{5}$/.test(zipCode)) {
    return { error: "Enter a valid 5-digit zip code." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }
  if (!data.user) {
    return { error: "Something went wrong creating your account. Please try again." };
  }

  const [licensePath, insurancePath] = await Promise.all([
    uploadCustomerDocument(data.user.id, licenseFile, "license"),
    uploadCustomerDocument(data.user.id, insuranceFile, "insurance"),
  ]);

  // Admin client for the profile insert — same reasoning as the broker
  // signup flow: if the Supabase project requires email confirmation, there's
  // no active session yet to satisfy the customers RLS policy.
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("customers").insert({
    id: data.user.id,
    first_name: firstName,
    last_name: lastName,
    zip_code: zipCode,
    address,
    current_vehicle: currentVehicle,
    drivers_license_path: licensePath,
    insurance_card_path: insurancePath,
  });

  if (profileError) {
    return { error: profileError.message };
  }

  if (!data.session) {
    return { error: null, needsConfirmation: true };
  }

  redirect("/customer/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/customer/login");
}
