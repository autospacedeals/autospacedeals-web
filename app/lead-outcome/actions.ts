"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { OUTCOMES_ENABLED, isLeadOutcome, isValidOutcomeToken, saveConversationOutcome } from "@/lib/leads";

// The button on /lead-outcome (from the check-in email's one-click links).
// The signed link is the permission, so no login is needed.
export async function confirmLeadOutcomeAction(formData: FormData) {
  const c = String(formData.get("c") ?? "");
  const o = String(formData.get("o") ?? "");
  const t = String(formData.get("t") ?? "");
  if (!OUTCOMES_ENABLED || !/^[0-9a-f-]{36}$/i.test(c) || !isLeadOutcome(o) || !isValidOutcomeToken(c, o, t)) {
    redirect("/lead-outcome?error=1");
  }
  const ok = await saveConversationOutcome(c, o);
  revalidatePath("/admin/leads");
  redirect(ok ? `/lead-outcome?saved=${o}` : "/lead-outcome?error=1");
}
