"use server";

// "Text me new messages": confirm a mobile number with a texted code, then
// new messages are also texted (lib/messages.ts textRecipient) and text
// replies come back in (app/api/twilio/sms/route.ts). Writes go through the
// service role (sms_settings has no user write policies) after checking
// who's signed in.
import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { messagingRole } from "@/lib/messages";
import { checkVerification, isSmsConfigured, sendSms, startVerification, toE164 } from "@/lib/twilio";

type Result = { ok: true } | { ok: false; error: string };

async function signedInMessagingUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await messagingRole(supabase, user);
  return role === "customer" || role === "broker" ? { user, role } : null;
}

function revalidate(role: "customer" | "broker") {
  revalidatePath(role === "customer" ? "/customer/dashboard" : "/broker/dashboard");
}

export async function startSmsVerificationAction(phoneRaw: string): Promise<Result> {
  if (!isSmsConfigured()) return { ok: false, error: "Texts aren't available yet." };
  const me = await signedInMessagingUser();
  if (!me) return { ok: false, error: "Log in again to set up texts." };
  const phone = toE164(phoneRaw);
  if (!phone) return { ok: false, error: "Enter a valid 10-digit US mobile number." };

  const admin = createAdminClient();
  const { data: taken } = await admin
    .from("sms_settings")
    .select("user_id")
    .eq("phone", phone)
    .eq("enabled", true)
    .neq("user_id", me.user.id)
    .maybeSingle();
  if (taken) return { ok: false, error: "That number already gets Drive texts for another account." };

  const started = await startVerification(phone);
  if (!started.ok) return { ok: false, error: started.error ?? "We couldn't text a code right now." };
  const { error } = await admin
    .from("sms_settings")
    .upsert({ user_id: me.user.id, pending_phone: phone, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    console.error("startSmsVerification: save failed:", error.message);
    return { ok: false, error: "Something went wrong — please try again." };
  }
  return { ok: true };
}

export async function confirmSmsVerificationAction(code: string): Promise<Result> {
  if (!isSmsConfigured()) return { ok: false, error: "Texts aren't available yet." };
  const me = await signedInMessagingUser();
  if (!me) return { ok: false, error: "Log in again to set up texts." };
  const clean = String(code ?? "").replace(/\D/g, "");
  if (clean.length < 4 || clean.length > 10) return { ok: false, error: "Enter the code we texted you." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("sms_settings")
    .select("pending_phone")
    .eq("user_id", me.user.id)
    .maybeSingle<{ pending_phone: string | null }>();
  if (!row?.pending_phone) return { ok: false, error: "Send yourself a code first." };
  if (!(await checkVerification(row.pending_phone, clean))) {
    return { ok: false, error: "That code didn't match or has expired — check it, or send a new one." };
  }

  const { error } = await admin
    .from("sms_settings")
    .update({
      phone: row.pending_phone,
      pending_phone: null,
      enabled: true,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", me.user.id);
  if (error) {
    console.error("confirmSmsVerification: save failed:", error.message);
    return {
      ok: false,
      error: error.code === "23505" ? "That number already gets Drive texts for another account." : "Something went wrong — please try again.",
    };
  }
  // The opt-in confirmation carriers expect (and what STOP/HELP do).
  await sendSms(
    row.pending_phone,
    "Drive: You'll now get a text when you have a new message on Drive. Reply to a message text to answer it. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."
  );
  revalidate(me.role);
  return { ok: true };
}

export async function disableSmsAction(): Promise<Result> {
  const me = await signedInMessagingUser();
  if (!me) return { ok: false, error: "Log in again to change this." };
  const { error } = await createAdminClient()
    .from("sms_settings")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", me.user.id);
  if (error) {
    console.error("disableSms failed:", error.message);
    return { ok: false, error: "Couldn't save that — please try again." };
  }
  revalidate(me.role);
  return { ok: true };
}
