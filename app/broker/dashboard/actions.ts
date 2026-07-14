"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SubmissionState = {
  error: string | null;
  success?: boolean;
};

export async function createSubmissionAction(
  _prevState: SubmissionState,
  formData: FormData
): Promise<SubmissionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const sourceType = String(formData.get("sourceType") || "link");
  const notes = String(formData.get("notes") || "").trim() || null;
  let sourceUrl = "";

  if (sourceType === "excel_file") {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { error: "Please choose a file to upload." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { error: "File is too large — please keep it under 10MB." };
    }

    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("broker-uploads")
      .upload(path, file);
    if (uploadError) return { error: uploadError.message };

    sourceUrl = path;
  } else if (sourceType === "google_sheet" || sourceType === "link") {
    sourceUrl = String(formData.get("sourceUrl") || "").trim();
    if (!sourceUrl) return { error: "Please enter a link." };
    try {
      // eslint-disable-next-line no-new
      new URL(sourceUrl);
    } catch {
      return { error: "That doesn't look like a valid URL." };
    }
  } else {
    return { error: "Unknown source type." };
  }

  const { error } = await supabase.from("submissions").insert({
    broker_id: user.id,
    source_type: sourceType,
    source_url: sourceUrl,
    notes,
  });
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  return { error: null, success: true };
}
