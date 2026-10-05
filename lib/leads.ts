// Lead tracking (supabase/migrations/0033_lead_tracking.sql): where a
// shopper came from, and the "did this one sell?" outcome brokers mark on a
// conversation — from the conversation page, or from the one-click links in
// the check-in email (/lead-outcome, signed so they work without logging
// in). SERVER-ONLY.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { SOURCE_COOKIE, decodeSource, type VisitSource } from "@/lib/visit-source";

// The "did it sell?" part — the buttons on conversations, the daily
// check-in email and the sales columns on /admin/leads. Off for now; the
// code stays so it can be switched on later.
export const OUTCOMES_ENABLED = false;

export type LeadOutcome = "sold" | "working" | "lost";

export const OUTCOME_LABELS: Record<LeadOutcome, string> = {
  sold: "Sold",
  working: "Still working",
  lost: "Didn't buy",
};

export function isLeadOutcome(v: unknown): v is LeadOutcome {
  return v === "sold" || v === "working" || v === "lost";
}

// How the current visitor found the site (their drive_src cookie), if known.
export async function currentVisitSource(): Promise<VisitSource | null> {
  try {
    return decodeSource((await cookies()).get(SOURCE_COOKIE)?.value);
  } catch {
    return null;
  }
}

// Signing key for the email links, derived from the service-role key (a
// server-only secret) so there's no extra secret to set up.
function signingKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", secret).update("drive-lead-outcome-v1").digest();
}

export function outcomeToken(conversationId: string, outcome: LeadOutcome): string {
  return createHmac("sha256", signingKey()).update(`${conversationId}:${outcome}`).digest("base64url").slice(0, 32);
}

export function isValidOutcomeToken(conversationId: string, outcome: LeadOutcome, token: string): boolean {
  const expected = Buffer.from(outcomeToken(conversationId, outcome));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function saveConversationOutcome(conversationId: string, outcome: LeadOutcome): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("conversations")
    .update({ outcome, outcome_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) console.error("saveConversationOutcome failed:", error.message);
  return !error;
}
