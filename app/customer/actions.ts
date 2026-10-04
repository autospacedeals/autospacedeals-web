"use server";

import { redirect } from "next/navigation";
import { normalizeUsPhone, PHONE_ERROR } from "@/lib/phone";
import { accountHome } from "@/lib/account-home";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { safeNextPath } from "@/lib/safe-next-path";
import { suggestEmailFix } from "@/lib/email-typos";

export type AuthState = {
  error: string | null;
  needsConfirmation?: boolean;
};

export type ResetRequestState = {
  error: string | null;
  sent?: boolean;
};

export async function signInAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  // Optional post-login destination from the login page's ?next= param —
  // client-supplied, so it's re-checked here and only a same-site path
  // is ever followed.
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect(next ?? "/customer/dashboard");
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
  const phoneRaw = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim() || null;
  const currentVehicle = String(formData.get("currentVehicle") || "").trim() || null;
  const licenseFile = formData.get("driversLicense") as File | null;
  const insuranceFile = formData.get("insuranceCard") as File | null;

  if (!email || !password || !firstName || !lastName || !zipCode || !phoneRaw) {
    return { error: "Please fill in your name, email, phone, password, and zip code." };
  }
  if (!/^\d{5}$/.test(zipCode)) {
    return { error: "Enter a valid 5-digit zip code." };
  }
  const phone = normalizeUsPhone(phoneRaw);
  if (!phone) return { error: PHONE_ERROR };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // A mistyped domain ("gmai.com") means the confirmation email never
  // arrives and the account can't be confirmed — catch it up front.
  const emailFix = suggestEmailFix(email);
  if (emailFix) {
    return { error: `Check your email address — did you mean ${emailFix}?` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: error.message };
  }
  if (!data.user) {
    return { error: "Something went wrong creating your account. Please try again." };
  }
  // Supabase deliberately avoids leaking whether an email is already
  // registered: if one is, signUp() still returns success with a `user`
  // object, but doesn't actually create a new auth row — that object's id
  // has no matching row in auth.users. The tell is an empty `identities`
  // array. Without this check we'd sail on to the customers insert below
  // and hit a raw foreign-key violation instead of a real error message.
  if (data.user.identities && data.user.identities.length === 0) {
    return { error: "An account with this email already exists. Try signing in instead." };
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
    phone,
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

export async function requestPasswordResetAction(
  _prevState: ResetRequestState,
  formData: FormData
): Promise<ResetRequestState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    return { error: "Enter your email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/auth/callback?next=/customer/reset-password`,
  });

  // Report success either way — confirming or denying that an email exists
  // in the system is a minor account-enumeration leak we don't need.
  if (error) console.error("requestPasswordResetAction failed:", error.message);
  return { error: null, sent: true };
}

export async function resetPasswordAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  // Shoppers, brokers and admins all use this page (admins set their first
  // password here from their invite email), so each goes to their own home.
  redirect(updated.user ? await accountHome(supabase, updated.user) : "/customer/dashboard");
}

// Second step of "Continue with Google": the person is signed in but has no
// customer profile yet (Google gives a name and email, not a zip code).
// Creates their customers row with their own session — RLS only allows a
// customer to insert their own row (supabase/migrations/0013).
export async function completeProfileAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const firstName = String(formData.get("firstName") || "").trim().slice(0, 80);
  const lastName = String(formData.get("lastName") || "").trim().slice(0, 80);
  const zipCode = String(formData.get("zipCode") || "").trim();
  const phoneRaw = String(formData.get("phone") || "").trim();
  const next = safeNextPath(formData.get("next")) ?? "/customer/dashboard";

  if (!firstName || !lastName || !zipCode || !phoneRaw) {
    return { error: "Please fill in your name, zip code, and phone." };
  }
  if (!/^\d{5}$/.test(zipCode)) {
    return { error: "Enter a valid 5-digit zip code." };
  }
  const phone = normalizeUsPhone(phoneRaw);
  if (!phone) return { error: PHONE_ERROR };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/customer/login");

  const { data: existing } = await supabase.from("customers").select("id").eq("id", user.id).maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("customers").insert({
      id: user.id,
      first_name: firstName,
      last_name: lastName,
      zip_code: zipCode,
      phone,
    });
    if (error) {
      console.error("completeProfileAction: insert failed:", error.message);
      return { error: "We couldn't save your details. Please try again in a moment." };
    }
  }

  redirect(next);
}
