// Handles Supabase auth email links (password reset, email confirmation)
// that redirect back with a `code` param. Exchanges it for a session, then
// forwards the user on to wherever they actually need to be next.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next-path";

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
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/customer/login`);
}
