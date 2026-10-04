"use server";

// Adding and removing Drive admins (supabase/migrations/0026_admins.sql).
// Adding someone who has no account yet creates one (email confirmed) and
// emails them a link to set their password; either way they get an email
// saying they're an admin and where to sign in.
import { revalidatePath } from "next/cache";
import { OWNER_EMAILS, normalizeEmail, requireAdmin } from "@/lib/admin";
import { findAuthUserByEmail } from "@/lib/admin-data";
import { createAdminClient } from "@/lib/supabase/server";
import { emailLayoutHtml, emailLinkHtml, escapeHtml, isEmailConfigured, sendEmail, siteLink } from "@/lib/email";
import { isValidEmailAddress } from "@/lib/get-matched";

export type AdminChangeState = { error: string | null; notice?: string };

export async function addAdminAction(_prev: AdminChangeState, formData: FormData): Promise<AdminChangeState> {
  const me = await requireAdmin("/admin/admins");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!isValidEmailAddress(email)) return { error: "Enter a valid email address." };

  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("admins")
    .upsert({ email, added_by: me.email }, { onConflict: "email", ignoreDuplicates: true });
  if (insertError) {
    console.error("addAdmin: insert failed:", insertError.message);
    return { error: "Couldn't add that admin — please try again." };
  }

  // Make sure they can sign in.
  let existing = await findAuthUserByEmail(email);
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) {
      console.error("addAdmin: createUser failed:", error?.message);
      revalidatePath("/admin/admins");
      return { error: `Added ${email} as an admin, but couldn't create their login: ${error?.message ?? "unknown error"}` };
    }
    existing = data.user;
  }

  // A one-time link to set (or reset) their password, on our own domain.
  let setPasswordUrl: string | null = null;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (linkError || !link?.properties?.hashed_token) {
    console.error("addAdmin: generateLink failed:", linkError?.message);
  } else {
    setPasswordUrl = siteLink(`/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery`);
  }

  let emailed = false;
  if (isEmailConfigured()) {
    const loginUrl = siteLink("/admin/login");
    const html = emailLayoutHtml({
      preheader: "You've been added as a Drive admin.",
      heading: "You're a Drive admin",
      bodyHtml:
        `<p style="margin:0 0 12px 0;">${escapeHtml(me.email)} added you as an admin on Drive. Admins can see every user and conversation and manage the site.</p>` +
        (setPasswordUrl
          ? `<p style="margin:0 0 12px 0;">${emailLinkHtml(setPasswordUrl, "Set your password")} (this link works once and expires in an hour).</p>`
          : "") +
        `<p style="margin:0;">After that, sign in any time at ${emailLinkHtml(loginUrl, loginUrl)}.</p>`,
      footerHtml: "You got this because a Drive admin added your email.",
    });
    const text =
      `${me.email} added you as an admin on Drive.\n\n` +
      (setPasswordUrl ? `Set your password (works once, expires in an hour): ${setPasswordUrl}\n\n` : "") +
      `Then sign in any time at ${loginUrl}`;
    const sent = await sendEmail({ to: email, subject: "You're a Drive admin", html, text });
    emailed = sent.ok;
    if (!sent.ok) console.error("addAdmin: email failed:", sent.error);
  }

  revalidatePath("/admin/admins");
  return {
    error: null,
    notice: emailed
      ? `Added ${email}. We emailed them a link to set their password and sign in.`
      : `Added ${email}, but the email didn't send — they can use "Forgot password?" on the admin sign-in page.`,
  };
}

export async function removeAdminAction(email: string): Promise<{ error: string | null }> {
  const me = await requireAdmin("/admin/admins");
  const target = normalizeEmail(email);
  if (target === me.email) return { error: "You can't remove yourself." };
  if (OWNER_EMAILS.map(normalizeEmail).includes(target)) return { error: "The site owner account can't be removed." };
  const { error } = await createAdminClient().from("admins").delete().eq("email", target);
  if (error) {
    console.error("removeAdmin failed:", error.message);
    return { error: "Couldn't remove that admin — please try again." };
  }
  revalidatePath("/admin/admins");
  return { error: null };
}
