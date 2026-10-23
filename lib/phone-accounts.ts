// Shopper accounts made from a phone number (the "message the seller
// without signing up" flow, app/messages/quick-actions.ts): no password and
// no email. Supabase sign-ins are keyed by email, so each one gets a
// placeholder address on a domain that receives no mail. lib/email.ts
// never sends to it, and the shopper signs back in with a texted code.
// SERVER-ONLY.
import { createAdminClient, type createClient } from "@/lib/supabase/server";

const PHONE_EMAIL_DOMAIN = "phone.idriveus.com";

// "+19495551234" -> "p19495551234@phone.idriveus.com".
export function phoneAccountEmail(e164: string): string {
  return `p${e164.replace(/\D/g, "")}@${PHONE_EMAIL_DOMAIN}`;
}

export function isPhoneAccountEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`);
}

// Who already uses this number: a phone account (signed in with a code),
// or a regular account with this phone on it (it signs in with email, so a
// code isn't enough to get into it).
export async function phoneOwner(e164: string): Promise<{ phoneAccountId: string | null; emailAccount: boolean }> {
  const admin = createAdminClient();
  const [{ data: customers }, { data: texting }] = await Promise.all([
    admin.from("customers").select("id").eq("phone", e164).returns<{ id: string }[]>(),
    admin.from("sms_settings").select("user_id").eq("phone", e164).eq("enabled", true).returns<{ user_id: string }[]>(),
  ]);
  const ids = [...new Set([...(customers ?? []).map((c) => c.id), ...(texting ?? []).map((s) => s.user_id)])];
  let phoneAccountId: string | null = null;
  let emailAccount = false;
  for (const id of ids) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (!data?.user) continue;
    if (isPhoneAccountEmail(data.user.email)) phoneAccountId = data.user.id;
    else emailAccount = true;
  }
  return { phoneAccountId, emailAccount };
}

// Signs a phone account in on this request (sets the session cookies), the
// same way an emailed sign-in link does, without sending anything.
export async function signInPhoneAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  e164: string
): Promise<boolean> {
  const { data: link, error } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email: phoneAccountEmail(e164),
  });
  const tokenHash = link?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error("signInPhoneAccount: generateLink failed:", error?.message);
    return false;
  }
  const { error: verifyError } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyError) console.error("signInPhoneAccount: verifyOtp failed:", verifyError.message);
  return !verifyError;
}
