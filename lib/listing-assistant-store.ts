// Storage for the listing assistant (lib/listing-assistant.ts): the seller's
// rules (brokers.deal_incentive_rules) and the conversation
// (listing_assistant_messages, 0041). Both are server-only, read and
// written with the service role after the caller's seller is checked.
// SERVER-ONLY.
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getDealExtras, type DealExtras, type IncentiveRule } from "@/lib/deal-disclaimers";
import {
  DAILY_MESSAGE_LIMIT,
  describeRule,
  ruleChanges,
  type AssistantPlan,
  type AssistantPreview,
  type ListingSnapshot,
} from "@/lib/listing-assistant";

export interface AssistantMessageRow {
  id: string;
  broker_id: string;
  message: string;
  reply: string;
  plan: AssistantPlan | null;
  preview: AssistantPreview | null;
  status: "reply" | "proposed" | "applied" | "undone" | "cancelled";
  snapshot: AssistantSnapshot | null;
  created_at: string;
  applied_at: string | null;
}

export interface AssistantSnapshot {
  ruleId?: string;
  deletedRule?: IncentiveRule;
  listings: ListingSnapshot[];
}

// What the dashboard shows.
export interface AssistantMessageView {
  id: string;
  message: string;
  reply: string;
  status: AssistantMessageRow["status"];
  summary: string | null;
  kind: AssistantPlan["kind"] | null;
  preview: AssistantPreview | null;
  createdAt: string;
}

export interface AssistantRuleView {
  id: string;
  summary: string;
  changes: string[];
  instruction: string | null;
  createdAt: string | null;
}

// Messages sent in the last 24 hours against the cap (plus any extra an
// admin approved in that time, 0042), and whether a request for more is
// waiting or was turned down.
export interface AssistantUsage {
  used: number;
  limit: number;
  request: "pending" | "denied" | null;
}

export async function assistantUsage(brokerId: string): Promise<AssistantUsage> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count }, { data: requests }] = await Promise.all([
    admin
      .from("listing_assistant_messages")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", brokerId)
      // AI messages only (deleting a rule from the list doesn't count)
      .not("input_tokens", "is", null)
      .gte("created_at", since),
    admin
      .from("listing_assistant_requests")
      .select("status, extra, created_at, decided_at")
      .eq("broker_id", brokerId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .returns<{ status: string; extra: number; created_at: string; decided_at: string | null }[]>(),
  ]);
  const extra = (requests ?? [])
    .filter((r) => r.status === "approved" && r.decided_at && r.decided_at >= since)
    .reduce((n, r) => n + r.extra, 0);
  const latest = requests?.[0]?.status;
  return {
    used: count ?? 0,
    limit: DAILY_MESSAGE_LIMIT + extra,
    request: latest === "pending" ? "pending" : latest === "denied" ? "denied" : null,
  };
}

export interface PendingAssistantRequest {
  id: string;
  brokerId: string;
  businessName: string;
  createdAt: string;
  usedToday: number;
}

export async function listPendingAssistantRequests(): Promise<PendingAssistantRequest[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("listing_assistant_requests")
    .select("id, broker_id, created_at, brokers(business_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .returns<{ id: string; broker_id: string; created_at: string; brokers: { business_name: string } | null }[]>();
  if (error) {
    console.error("listPendingAssistantRequests failed:", error.message);
    return [];
  }
  return Promise.all(
    (data ?? []).map(async (r) => ({
      id: r.id,
      brokerId: r.broker_id,
      businessName: r.brokers?.business_name ?? "Unknown seller",
      createdAt: r.created_at,
      usedToday: (await assistantUsage(r.broker_id)).used,
    }))
  );
}

export const MESSAGE_COLUMNS = "id, broker_id, message, reply, plan, preview, status, snapshot, created_at, applied_at";

export function messageView(r: AssistantMessageRow): AssistantMessageView {
  return {
    id: r.id,
    message: r.message,
    reply: r.reply,
    status: r.status,
    summary: r.plan?.summary ?? null,
    kind: r.plan?.kind ?? null,
    preview: r.preview,
    createdAt: r.created_at,
  };
}

export function ruleView(r: IncentiveRule): AssistantRuleView {
  return {
    id: r.id!,
    summary: describeRule(r),
    changes: ruleChanges(r),
    instruction: r.instruction ?? null,
    createdAt: r.createdAt ?? null,
  };
}

export async function saveRules(brokerId: string, rules: IncentiveRule[]): Promise<string | null> {
  const { error } = await createAdminClient().from("brokers").update({ deal_incentive_rules: rules }).eq("id", brokerId);
  return error?.message ?? null;
}

// The seller's extras, with an id on every rule (rules set up before the
// assistant have none) so each can be named and deleted.
export async function getExtrasWithIds(brokerId: string): Promise<DealExtras> {
  const extras = await getDealExtras(brokerId);
  if (extras.rules.some((r) => r && !r.id)) {
    extras.rules = extras.rules.filter(Boolean).map((r) => (r.id ? r : { ...r, id: randomUUID() }));
    await saveRules(brokerId, extras.rules);
  }
  return extras;
}

export async function loadAssistantState(
  brokerId: string
): Promise<{
  messages: AssistantMessageView[];
  rules: AssistantRuleView[];
  disclaimerMakes: string[];
  usage: AssistantUsage;
  available: boolean;
}> {
  const [{ data, error }, extras, usage] = await Promise.all([
    createAdminClient()
      .from("listing_assistant_messages")
      .select(MESSAGE_COLUMNS)
      .eq("broker_id", brokerId)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<AssistantMessageRow[]>(),
    getExtrasWithIds(brokerId),
    assistantUsage(brokerId),
  ]);
  // Before the 0041 migration has been run, the assistant stays hidden.
  if (error) {
    console.error("Listing assistant: failed to load messages:", error.message);
    return { messages: [], rules: [], disclaimerMakes: [], usage, available: false };
  }
  return {
    messages: (data ?? []).reverse().map(messageView),
    rules: extras.rules.map(ruleView),
    disclaimerMakes: Object.keys(extras.disclaimers),
    usage,
    available: Boolean(process.env.ANTHROPIC_API_KEY),
  };
}
