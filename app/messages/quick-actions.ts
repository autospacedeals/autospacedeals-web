"use server";

// Message a seller without signing up first. On a listing, a signed-out
// shopper gives their first name, mobile number and message, and confirms
// the number with a texted code (Twilio Verify). They then get a shopper
// account behind the scenes, with no password and no email
// (lib/phone-accounts.ts), and are signed in; texts about the conversation
// are switched on, and the message goes to the seller like any other.
// Everything stays in Drive's messaging, tied to a verified number. A
// returning shopper signs in the same way, with a code (sendSignInCode /
// signInWithCode, used on /customer/login).
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getPublishedDealsByIds } from "@/lib/supabase/deals";
import { currentVisitSource } from "@/lib/leads";
import { MESSAGE_MAX } from "@/lib/messages";
import { startConversation } from "@/lib/conversation-writes";
import { phoneAccountEmail, phoneOwner, signInPhoneAccount } from "@/lib/phone-accounts";
import { safeNextPath } from "@/lib/safe-next-path";
import { checkVerification, isSmsConfigured, sendSms, startVerification, toE164 } from "@/lib/twilio";

type Failure = { ok: false; error: string; code?: "has-account" | "no-account" };

const PHONE_ERROR = "Enter a valid 10-digit US mobile number.";
const NOT_AVAILABLE = "Texting codes isn't available right now. Please log in or create an account instead.";
const HAS_ACCOUNT =
  "That number is on a Drive account that signs in with email. Log in to message the seller.";
// The same confirmation text as turning texts on from the dashboard
// (app/messages/sms-actions.ts), as listed on /text-alerts.
const OPT_IN_TEXT =
  "Drive: You'll now get a text when you have a new message on Drive. Reply to a message text to answer it. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.";

function cleanCode(raw: unknown): string | null {
  const code = String(raw ?? "").replace(/\D/g, "");
  return code.length >= 4 && code.length <= 10 ? code : null;
}

// Whether the code-by-text flow can be offered (Twilio is set up).
export async function quickMessageAvailableAction(): Promise<boolean> {
  return isSmsConfigured();
}

// Step 1: text a code to the shopper's number.
export async function sendQuickMessageCodeAction(input: { dealId: string; phone: string }): Promise<{ ok: true } | Failure> {
  if (!isSmsConfigured()) return { ok: false, error: NOT_AVAILABLE };
  const phone = toE164(input.phone);
  if (!phone) return { ok: false, error: PHONE_ERROR };

  const deal = (await getPublishedDealsByIds([String(input.dealId)]))?.[0];
  if (!deal) return { ok: false, error: "This listing isn't available anymore." };
  if (!deal.brokerId) return { ok: false, error: "This seller can't be messaged on Drive yet." };

  const owner = await phoneOwner(phone);
  if (owner.emailAccount && !owner.phoneAccountId) return { ok: false, code: "has-account", error: HAS_ACCOUNT };

  const started = await startVerification(phone);
  return started.ok ? { ok: true } : { ok: false, error: started.error ?? "We couldn't text a code right now." };
}

// Step 2: check the code, make (or sign in to) the shopper's account, and
// send their message.
export async function sendQuickMessageAction(input: {
  dealId: string;
  firstName: string;
  lastName: string;
  phone: string;
  body: string;
  code: string;
}): Promise<{ ok: true; conversationId: string } | Failure> {
  if (!isSmsConfigured()) return { ok: false, error: NOT_AVAILABLE };
  const firstName = String(input.firstName ?? "").trim().slice(0, 60);
  const lastName = String(input.lastName ?? "").trim().slice(0, 60) || null;
  const body = String(input.body ?? "").replace(/\r\n/g, "\n").trim();
  const phone = toE164(input.phone);
  const code = cleanCode(input.code);
  if (!firstName) return { ok: false, error: "Add your first name so the seller knows who's writing." };
  if (!body || body.length > MESSAGE_MAX) return { ok: false, error: "Write a message to the seller." };
  if (!phone) return { ok: false, error: PHONE_ERROR };
  if (!code) return { ok: false, error: "Enter the code we texted you." };

  const supabase = await createClient();
  const {
    data: { user: signedIn },
  } = await supabase.auth.getUser();
  if (signedIn) return { ok: false, error: "You're already signed in. Close this and send your message again." };

  const owner = await phoneOwner(phone);
  if (owner.emailAccount && !owner.phoneAccountId) return { ok: false, code: "has-account", error: HAS_ACCOUNT };
  if (!(await checkVerification(phone, code))) {
    return { ok: false, error: "That code didn't match or has expired. Check it, or send a new one." };
  }

  const admin = createAdminClient();
  let userId = owner.phoneAccountId;
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: phoneAccountEmail(phone),
      email_confirm: true,
      user_metadata: { signed_up_with: "phone" },
    });
    if (error || !created.user) {
      console.error("quickMessage: createUser failed:", error?.message);
      return { ok: false, error: "We couldn't set up your account. Please try again." };
    }
    const source = await currentVisitSource();
    const { error: profileError } = await admin.from("customers").insert({
      id: created.user.id,
      first_name: firstName,
      last_name: lastName,
      phone,
      signup_source: source?.source ?? null,
      signup_campaign: source?.campaign ?? null,
    });
    if (profileError) {
      console.error("quickMessage: profile insert failed:", profileError.message);
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, error: "We couldn't set up your account. Please try again." };
    }
    userId = created.user.id;
  }

  if (!(await signInPhoneAccount(supabase, phone))) {
    return { ok: false, error: "We couldn't sign you in. Please try again." };
  }

  // Replies come by text (the number was just confirmed); the first time,
  // the opt-in confirmation carriers expect.
  const { data: sms } = await admin
    .from("sms_settings")
    .select("enabled, phone")
    .eq("user_id", userId)
    .maybeSingle<{ enabled: boolean; phone: string | null }>();
  const now = new Date().toISOString();
  const { error: smsError } = await admin
    .from("sms_settings")
    .upsert({ user_id: userId, phone, pending_phone: null, enabled: true, verified_at: now, updated_at: now }, { onConflict: "user_id" });
  if (smsError) console.error("quickMessage: sms settings failed:", smsError.message);
  else if (!sms?.enabled || sms.phone !== phone) await sendSms(phone, OPT_IN_TEXT);

  const started = await startConversation(supabase, userId, String(input.dealId), body);
  if (started.ok) revalidatePath("/customer/messages");
  return started;
}

// Signing back in to an account made from a phone number: text a code...
export async function sendSignInCodeAction(phoneRaw: string): Promise<{ ok: true } | Failure> {
  if (!isSmsConfigured()) return { ok: false, error: "Signing in by text isn't available right now." };
  const phone = toE164(phoneRaw);
  if (!phone) return { ok: false, error: PHONE_ERROR };
  const owner = await phoneOwner(phone);
  if (!owner.phoneAccountId) {
    return owner.emailAccount
      ? { ok: false, code: "has-account", error: "That number's account signs in with email and password (or Google)." }
      : { ok: false, code: "no-account", error: "No Drive account uses that number yet. Message a seller from any listing to start one." };
  }
  const started = await startVerification(phone);
  return started.ok ? { ok: true } : { ok: false, error: started.error ?? "We couldn't text a code right now." };
}

// ...then check it and sign in.
export async function signInWithCodeAction(
  phoneRaw: string,
  codeRaw: string,
  nextRaw: string | null
): Promise<{ ok: true; to: string } | Failure> {
  if (!isSmsConfigured()) return { ok: false, error: "Signing in by text isn't available right now." };
  const phone = toE164(phoneRaw);
  const code = cleanCode(codeRaw);
  if (!phone) return { ok: false, error: PHONE_ERROR };
  if (!code) return { ok: false, error: "Enter the code we texted you." };
  const owner = await phoneOwner(phone);
  if (!owner.phoneAccountId) return { ok: false, error: "No Drive account uses that number yet." };
  if (!(await checkVerification(phone, code))) {
    return { ok: false, error: "That code didn't match or has expired. Check it, or send a new one." };
  }
  const supabase = await createClient();
  if (!(await signInPhoneAccount(supabase, phone))) return { ok: false, error: "We couldn't sign you in. Please try again." };
  return { ok: true, to: safeNextPath(nextRaw) ?? "/customer/dashboard" };
}
