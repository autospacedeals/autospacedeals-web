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

  redirect("/broker/dashboard");
}

export async function signUpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const contactName = String(formData.get("contactName") || "").trim();
  const businessName = String(formData.get("businessName") || "").trim();
  const sellerType = String(formData.get("sellerType") || "Broker");
  const contactPhone = String(formData.get("contactPhone") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const state = String(formData.get("state") || "").trim().toUpperCase();

  if (!email || !password || !contactName || !businessName || !contactPhone || !city || !state) {
    return { error: "Please fill in every field." };
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

  // Use the admin client for the profile insert so this works even if the
  // Supabase project requires email confirmation (in which case there's no
  // active browser session yet to satisfy the brokers RLS policy).
  const admin = createAdminClient();
  const { error: profileError } = await admin.from("brokers").insert({
    id: data.user.id,
    contact_name: contactName,
    business_name: businessName,
    seller_type: sellerType,
    contact_phone: contactPhone,
    city,
    state,
  });

  if (profileError) {
    return { error: profileError.message };
  }

  if (!data.session) {
    return { error: null, needsConfirmation: true };
  }

  redirect("/broker/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/broker/login");
}
