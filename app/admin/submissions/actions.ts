"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/broker/login");
  }
}

export async function reviewSubmissionAction(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const adminNotes = String(formData.get("adminNotes") || "").trim() || null;

  if (!id || (status !== "approved" && status !== "rejected")) {
    throw new Error("Invalid review submission.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("submissions")
    .update({ status, admin_notes: adminNotes, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/submissions");
}
