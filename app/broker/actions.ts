"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { alertAdminsNewBroker } from "@/lib/admin-alerts";
import { normalizeUsPhone, PHONE_ERROR } from "@/lib/phone";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { suggestEmailFix } from "@/lib/email-typos";
import { accountHome } from "@/lib/account-home";

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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // A shopper signing in here lands on their own dashboard.
  redirect(await accountHome(supabase, data.user));
}

export async function signUpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const contactName = String(formData.get("contactName") || "").trim();
  const sellerType = String(formData.get("sellerType") || "Broker");
  const dealershipName = String(formData.get("dealershipName") || "").trim() || null;
  // A dealership salesperson leads with their own name everywhere a
  // "business name" is normally shown (deal cards, their profile page,
  // etc.) — the dealership they work at is the separate affiliation field.
  const businessName =
    sellerType === "Salesperson"
      ? contactName
      : String(formData.get("businessName") || "").trim();
  const contactPhone = String(formData.get("contactPhone") || "").trim();
  const city = String(formData.get("city") || "").trim();
  const state = String(formData.get("state") || "").trim().toUpperCase();
  // Checked by an admin before anything goes public (supabase/migrations/
  // 0038_seller_verification.sql).
  const licenseNumber = String(formData.get("licenseNumber") || "")
    .trim()
    .toUpperCase();

  if (!email || !password || !contactName || !businessName || !contactPhone || !city || !state || !licenseNumber) {
    return { error: "Please fill in every field." };
  }
  if (!/^[A-Z0-9][A-Z0-9 -]{2,29}$/.test(licenseNumber)) {
    return { error: "Enter your DMV license number (letters and numbers only)." };
  }
  if (sellerType === "Salesperson" && !dealershipName) {
    return { error: "Please enter the dealership you work at." };
  }
  const phone = normalizeUsPhone(contactPhone);
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
  // array. Without this check we'd sail on to the brokers insert below and
  // hit a raw foreign-key violation instead of a real error message.
  if (data.user.identities && data.user.identities.length === 0) {
    return { error: "An account with this email already exists. Try signing in instead." };
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
    dealership_name: dealershipName,
    contact_phone: phone,
    city,
    state,
    license_number: licenseNumber,
    approved_at: null,
  });

  if (profileError) {
    // The login was created but its broker profile wasn't. Undo the login
    // (it's brand new — identities check above) so trying again works,
    // instead of every retry failing with "an account with this email
    // already exists" while no profile exists to sign in to.
    console.error("Broker signup: profile insert failed:", profileError.message);
    const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
    if (cleanupError) {
      console.error("Broker signup: couldn't remove the half-created login:", cleanupError.message);
    }
    return { error: "We couldn't finish creating your account. Please try again in a moment." };
  }

  // Let the admins know (after the response, so it never slows sign-up).
  after(() =>
    alertAdminsNewBroker({ businessName, contactName, sellerType, dealershipName, email, phone, city, state, licenseNumber })
  );

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
