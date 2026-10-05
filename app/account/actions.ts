"use server";

// The Account section on the shopper and broker dashboards (components/
// account/AccountSettings.tsx): change password, change email, delete
// account. Admin accounts are managed at /admin/admins, not here.
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { alertAdminsAccountDeleted } from "@/lib/admin-alerts";
import { suggestEmailFix } from "@/lib/email-typos";
import { hasPasswordLogin } from "@/lib/account";

export type AccountFormState = { error: string | null; message?: string };

async function signedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function changePasswordAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const current = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (password.length < 8) return { error: "Your new password must be at least 8 characters." };
  if (password !== confirm) return { error: "The new passwords don't match." };

  const { supabase, user } = await signedInUser();
  if (!user?.email) return { error: "Your session ended — log in again." };

  if (hasPasswordLogin(user)) {
    if (!current) return { error: "Enter your current password." };
    if (current === password) return { error: "Pick a new password that's different from your current one." };
    const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
    if (wrong) return { error: "Your current password isn't right." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("changePassword failed:", error.message);
    return { error: error.message };
  }
  return { error: null, message: "Password changed." };
}

export async function changeEmailAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "Enter a valid email address." };
  const fix = suggestEmailFix(email);
  if (fix) return { error: `Check the address — did you mean ${fix}?` };

  const { supabase, user } = await signedInUser();
  if (!user?.email) return { error: "Your session ended — log in again." };
  if (email === user.email.toLowerCase()) return { error: "That's already your email." };
  if (await isAdminEmail(user.email)) return { error: "Admin emails are changed at Admin → Admins." };

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    console.error("changeEmail failed:", error.message);
    if (/already|registered|exists/i.test(error.message)) return { error: "That email is already used by another Drive account." };
    if (/rate|too many/i.test(error.message)) return { error: "Too many emails sent just now — try again in a few minutes." };
    return { error: "We couldn't start that change. Please try again." };
  }
  // Supabase's "Secure email change" is on: both addresses get a link, and
  // the change happens once both are opened.
  return {
    error: null,
    message: `We sent a confirmation link to ${email} and another to ${user.email}. Open both and your email changes to ${email}. Until then, keep signing in with ${user.email}.`,
  };
}

export async function deleteAccountAction(_prev: AccountFormState, formData: FormData): Promise<AccountFormState> {
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") {
    return { error: 'Type DELETE in the box to confirm.' };
  }
  const { supabase, user } = await signedInUser();
  if (!user) return { error: "Your session ended — log in again." };
  if (await isAdminEmail(user.email)) return { error: "Admin accounts can't be deleted here." };

  const admin = createAdminClient();
  const [{ data: broker }, { data: customer }] = await Promise.all([
    admin.from("brokers").select("id, business_name, city, state").eq("id", user.id).maybeSingle<{
      id: string;
      business_name: string;
      city: string;
      state: string;
    }>(),
    admin
      .from("customers")
      .select("drivers_license_path, insurance_card_path")
      .eq("id", user.id)
      .maybeSingle<{ drivers_license_path: string | null; insurance_card_path: string | null }>(),
  ]);

  try {
    let listings = 0;
    if (broker) {
      // Listings would otherwise stay live with no seller (deals.broker_id
      // is "on delete set null").
      const { data: removed, error } = await admin.from("deals").delete().eq("broker_id", user.id).select("id");
      if (error) throw new Error(`deals: ${error.message}`);
      listings = removed?.length ?? 0;
      await removeFolder(admin, "broker-uploads", user.id);
    }
    if (customer) {
      const files = [customer.drivers_license_path, customer.insurance_card_path].filter((p): p is string => Boolean(p));
      if (files.length) await admin.storage.from("customer-uploads").remove(files);
      await removeFolder(admin, "customer-uploads", user.id);
    }

    // Removes the login; profile, conversations, saved deals, searches and
    // text settings go with it (on delete cascade).
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`auth: ${error.message}`);

    if (broker) {
      const b = broker;
      const email = user.email ?? "";
      after(() => alertAdminsAccountDeleted({ businessName: b.business_name, email, city: b.city, state: b.state, listings }));
    }
  } catch (err) {
    console.error("deleteAccount failed:", err instanceof Error ? err.message : err);
    return { error: "We couldn't delete your account just now. Please try again, or contact us and we'll do it for you." };
  }

  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/account-deleted");
}

// Every file under `${userId}/` in a private bucket (uploads are namespaced
// by user id). Best-effort.
async function removeFolder(admin: ReturnType<typeof createAdminClient>, bucket: string, userId: string) {
  try {
    const { data } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    const paths = (data ?? []).filter((f) => f.id).map((f) => `${userId}/${f.name}`);
    if (paths.length) await admin.storage.from(bucket).remove(paths);
  } catch (err) {
    console.error(`removeFolder ${bucket} failed:`, err);
  }
}
