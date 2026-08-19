"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Shared sign-out for the site header, which can show either a broker or a
// customer account — unlike the broker dashboard's own sign-out button
// (which knows to send a broker back to /broker/login), this one just goes
// back to the homepage since it doesn't know which type of account it is.
export async function headerSignOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
