// Google sends the admin back here after signing in as sheets@idriveus.com:
// checks the state cookie, trades the code for a refresh token and saves it.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { READER_EMAIL, exchangeReaderCode, saveReader } from "@/lib/google-reader";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

function back(params: Record<string, string>) {
  const res = NextResponse.redirect(`${SITE_URL}/admin/google-reader?${new URLSearchParams(params)}`);
  res.cookies.delete({ name: "google_reader_state", path: "/api/google-reader" });
  return res;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin("/admin/google-reader");
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back({ error: "Google sign-in was cancelled." });
  if (!state || state !== request.cookies.get("google_reader_state")?.value) {
    return back({ error: "That sign-in link expired — please try again." });
  }
  if (!code) return back({ error: "Google didn't send a sign-in code — please try again." });

  const result = await exchangeReaderCode(code);
  if (!result.ok) return back({ error: result.error });
  if (result.email !== READER_EMAIL) {
    return back({ error: `You signed in as ${result.email} — please sign in as ${READER_EMAIL}.` });
  }
  const saveError = await saveReader(result.email, result.refreshToken, admin.email);
  if (saveError) return back({ error: saveError });
  return back({ connected: "1" });
}
