"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { safeNextPath } from "@/lib/safe-next-path";

export type AdminLoginState = { error: string | null };

export async function adminSignInAction(_prev: AdminLoginState, formData: FormData): Promise<AdminLoginState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!(await isAdminEmail(data.user.email))) {
    await supabase.auth.signOut();
    return { error: "That account isn't a Drive admin." };
  }
  const next = safeNextPath(formData.get("next"));
  redirect(next && next.startsWith("/admin") ? next : "/admin");
}
