// Where the links in Drive's auth emails land (see supabase/email-templates):
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email     (confirm signup)
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery  (reset password)
// Verifying the token here — instead of linking to Supabase's own
// /auth/v1/verify URL — keeps every link in the email on idriveus.com (a
// link to a different domain than the sender is a spam signal), and works
// even when the link is opened on another device or browser than the one
// used to sign up (the code-exchange flow in /auth/callback needs a cookie
// from the original browser). /auth/callback still handles Google sign-in
// and older emails.
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next-path";
import { isAdminEmail } from "@/lib/admin";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const typeParam = searchParams.get("type");
  const type = OTP_TYPES.find((t) => t === typeParam);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/customer/reset-password`);
      }
      const next = safeNextPath(searchParams.get("next"));
      if (next) return NextResponse.redirect(`${origin}${next}`);
      if (await isAdminEmail(data.user.email)) return NextResponse.redirect(`${origin}/admin`);
      // Brokers and customers share the signup email; send each to their own dashboard.
      const { data: broker } = await supabase.from("brokers").select("id").eq("id", data.user.id).maybeSingle();
      return NextResponse.redirect(`${origin}${broker ? "/broker/dashboard" : "/customer/dashboard"}`);
    }
    console.error("auth confirm: verifyOtp failed:", error?.message ?? "no user");

    // Each link works once — opening it again (or an email app having
    // already opened it) looks like an expired token. Someone who's already
    // signed in from the first click just carries on to their dashboard.
    if (type !== "recovery") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: broker } = await supabase.from("brokers").select("id").eq("id", user.id).maybeSingle();
        return NextResponse.redirect(`${origin}${broker ? "/broker/dashboard" : "/customer/dashboard"}`);
      }
    }
    const url = new URL("/customer/login", origin);
    url.searchParams.set("error", "signin");
    url.searchParams.set(
      "reason",
      type === "recovery"
        ? "This reset link was already used or has expired — request a new one with Forgot password."
        : "This link was already used or has expired. If you already confirmed your email, just sign in below."
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(`${origin}/customer/login?error=signin`);
}
