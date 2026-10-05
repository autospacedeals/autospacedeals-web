// Starts connecting the sheets@idriveus.com Google account (admins only):
// sends the admin to Google's sign-in with a one-time state cookie.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { readerAuthUrl } from "@/lib/google-reader";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin("/admin/google-reader");
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(readerAuthUrl(state));
  res.cookies.set("google_reader_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/google-reader",
    maxAge: 600,
  });
  return res;
}
