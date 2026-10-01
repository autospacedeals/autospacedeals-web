// Handles Supabase auth redirects that come back with a `code` param —
// email links (password reset, email confirmation) and "Continue with
// Google". Exchanges it for a session, then forwards the user on to
// wherever they actually need to be next.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next-path";
import { isAdminEmail } from "@/lib/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Same-site paths only — a crafted `next` like "@evil.com" would
  // otherwise turn `${origin}${next}` into a different host.
  const next = safeNextPath(searchParams.get("next")) ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Someone signing in with Google for the first time has a login but
      // no customer profile yet (Google doesn't give us a zip code), so
      // they finish it on one short screen. Brokers, admin and existing
      // customers carry straight on.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && !isAdminEmail(user.email)) {
        const [{ data: customer }, { data: broker }] = await Promise.all([
          supabase.from("customers").select("id").eq("id", user.id).maybeSingle(),
          supabase.from("brokers").select("id").eq("id", user.id).maybeSingle(),
        ]);
        if (!customer && !broker) {
          const finish = new URL("/customer/complete-profile", origin);
          if (next !== "/") finish.searchParams.set("next", next);
          return NextResponse.redirect(finish);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("auth callback: code exchange failed:", error.message);
  } else if (searchParams.get("error")) {
    // e.g. the person cancelled on Google's screen.
    console.error("auth callback: provider error:", searchParams.get("error_description") ?? searchParams.get("error"));
  }

  return NextResponse.redirect(`${origin}/customer/login?error=signin`);
}
