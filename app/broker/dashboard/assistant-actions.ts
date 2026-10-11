"use server";

// The listing assistant's actions (see lib/listing-assistant.ts): ask (the
// AI proposes one change, with a preview of the cars it touches), apply,
// cancel, undo, and deleting a rule from the list. Listings are changed
// with the seller's own session (RLS keeps it to their cars); their rules
// and the conversation are server-only and written with the service role.
import { randomUUID } from "crypto";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { alertAdminsAssistantRequest } from "@/lib/admin-alerts";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { mapLimit } from "@/lib/concurrency";
import {
  ASSISTANT_LISTING_COLUMNS,
  MESSAGE_MAX,
  askAssistant,
  buildPreview,
  describeRule,
  planTargets,
  ruleRemoval,
  ruleUpdate,
  snapshotOf,
  type AssistantListing,
  type AssistantPlan,
} from "@/lib/listing-assistant";
import {
  MESSAGE_COLUMNS,
  assistantUsage,
  getExtrasWithIds,
  messageView,
  saveRules,
  type AssistantMessageRow,
  type AssistantMessageView,
  type AssistantSnapshot,
  type AssistantUsage,
} from "@/lib/listing-assistant-store";

async function sellerContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");
  const { data: broker } = await supabase.from("brokers").select("id").eq("id", user.id).maybeSingle();
  if (!broker) redirect("/broker/login");
  return { supabase, brokerId: user.id };
}

async function loadListings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brokerId: string
): Promise<AssistantListing[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(ASSISTANT_LISTING_COLUMNS)
    .eq("broker_id", brokerId)
    .in("status", ["draft", "published"])
    .returns<AssistantListing[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadMessage(brokerId: string, id: string): Promise<AssistantMessageRow | null> {
  const { data } = await createAdminClient()
    .from("listing_assistant_messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", id)
    .eq("broker_id", brokerId)
    .maybeSingle<AssistantMessageRow>();
  return data ?? null;
}

function revalidateListings() {
  revalidatePath("/broker/dashboard");
  revalidatePath("/admin/listings");
  revalidatePath("/");
}

// One update per listing, a few at a time; only listings that change.
async function updateListings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listings: AssistantListing[],
  change: (l: AssistantListing) => Record<string, unknown>
): Promise<{ changed: AssistantListing[]; failed: number; lastError: string | null }> {
  const changed: AssistantListing[] = [];
  let failed = 0;
  let lastError: string | null = null;
  await mapLimit(listings, 6, async (l) => {
    const update = change(l);
    const differs = Object.entries(update).some(
      ([k, v]) => JSON.stringify(v ?? null) !== JSON.stringify((l as unknown as Record<string, unknown>)[k] ?? null)
    );
    if (!differs) return;
    const { error } = await supabase
      .from("deals")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", l.id);
    if (error) {
      failed++;
      lastError = error.message;
    } else {
      changed.push(l);
    }
  });
  return { changed, failed, lastError };
}

function limitMessage(usage: AssistantUsage): string {
  if (usage.request === "pending") return "You've used today's assistant messages. Your request for more is waiting for approval.";
  return `You've used today's ${usage.limit} assistant messages. Request more, or they reset over the next 24 hours.`;
}

export async function askListingAssistantAction(
  message: string
): Promise<{ error: string | null; message?: AssistantMessageView; usage?: AssistantUsage }> {
  const { supabase, brokerId } = await sellerContext();
  const text = String(message ?? "").trim();
  if (!text) return { error: "Type what you'd like changed." };
  if (text.length > MESSAGE_MAX) return { error: `Keep it under ${MESSAGE_MAX} characters.` };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "The assistant isn't available right now." };

  const admin = createAdminClient();
  const [usage, { data: recent }] = await Promise.all([
    assistantUsage(brokerId),
    admin
      .from("listing_assistant_messages")
      .select("message, reply, status")
      .eq("broker_id", brokerId)
      .order("created_at", { ascending: false })
      .limit(6)
      .returns<{ message: string; reply: string; status: string }[]>(),
  ]);
  if (usage.used >= usage.limit) {
    return { error: limitMessage(usage), usage };
  }

  let listings: AssistantListing[];
  try {
    listings = await loadListings(supabase, brokerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load your listings." };
  }
  const extras = await getExtrasWithIds(brokerId);

  let answer: Awaited<ReturnType<typeof askAssistant>>;
  try {
    answer = await askAssistant({ message: text, history: (recent ?? []).reverse(), listings, extras });
  } catch (err) {
    console.error("Listing assistant failed:", err);
    return { error: "The assistant couldn't answer just now. Try again in a minute." };
  }

  let plan: AssistantPlan | null = answer.plan;
  let preview = null;
  if (plan) {
    const targets = planTargets(plan, listings, extras);
    // Taking down or deleting nothing isn't a change; a rule with no cars
    // yet still covers cars added later.
    if (targets.length === 0 && plan.kind !== "rule") plan = null;
    else preview = buildPreview(plan, targets, extras);
  }

  const { data: row, error } = await admin
    .from("listing_assistant_messages")
    .insert({
      broker_id: brokerId,
      message: text,
      reply: plan || answer.plan === null ? answer.reply : `${answer.reply} (None of your current cars match that, though.)`,
      plan,
      preview,
      status: plan ? "proposed" : "reply",
      input_tokens: answer.inputTokens,
      output_tokens: answer.outputTokens,
    })
    .select(MESSAGE_COLUMNS)
    .single<AssistantMessageRow>();
  if (error || !row) return { error: error?.message ?? "Couldn't save the message." };
  return { error: null, message: messageView(row), usage: { ...usage, used: usage.used + 1 } };
}

// Out of messages for the day: ask an admin for more (emailed; approved on
// Admin → Users).
export async function requestMoreAssistantUsageAction(): Promise<{ error: string | null; usage?: AssistantUsage }> {
  const { brokerId } = await sellerContext();
  const usage = await assistantUsage(brokerId);
  if (usage.request === "pending") return { error: null, usage };
  if (usage.used < usage.limit) return { error: "You still have messages left today.", usage };

  const admin = createAdminClient();
  const { error } = await admin.from("listing_assistant_requests").insert({ broker_id: brokerId });
  if (error) return { error: error.message };
  const [{ data: broker }, { data: recent }] = await Promise.all([
    admin.from("brokers").select("business_name").eq("id", brokerId).maybeSingle<{ business_name: string }>(),
    admin
      .from("listing_assistant_messages")
      .select("message")
      .eq("broker_id", brokerId)
      .not("input_tokens", "is", null)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<{ message: string }[]>(),
  ]);
  after(() =>
    alertAdminsAssistantRequest({
      businessName: broker?.business_name ?? "A seller",
      used: usage.used,
      recentMessages: (recent ?? []).map((r) => r.message),
    })
  );
  revalidatePath("/admin/users");
  return { error: null, usage: { ...usage, request: "pending" } };
}

export async function applyListingAssistantAction(
  id: string
): Promise<{ error: string | null; message?: AssistantMessageView; changed?: number }> {
  const { supabase, brokerId } = await sellerContext();
  const row = await loadMessage(brokerId, id);
  if (!row || row.status !== "proposed" || !row.plan) return { error: "That change was already applied or cancelled." };
  return applyPlan(supabase, brokerId, row, row.plan);
}

async function applyPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brokerId: string,
  row: AssistantMessageRow,
  plan: AssistantPlan
): Promise<{ error: string | null; message?: AssistantMessageView; changed?: number }> {
  let listings: AssistantListing[];
  try {
    listings = await loadListings(supabase, brokerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load your listings." };
  }
  const extras = await getExtrasWithIds(brokerId);
  // The cars as they are now, not when it was proposed.
  const targets = planTargets(plan, listings, extras);
  const snapshot: AssistantSnapshot = { listings: [] };
  let result: Awaited<ReturnType<typeof updateListings>>;

  if (plan.kind === "rule") {
    const rule = {
      ...plan.rule,
      id: randomUUID(),
      summary: plan.summary,
      instruction: row.message,
      createdAt: new Date().toISOString(),
    };
    const saveError = await saveRules(brokerId, [...extras.rules, rule]);
    if (saveError) return { error: saveError };
    snapshot.ruleId = rule.id;
    result = await updateListings(supabase, targets, (l) => ruleUpdate(rule, l));
  } else if (plan.kind === "remove") {
    result = await updateListings(supabase, targets, () => ({ status: "removed", removed_at: new Date().toISOString() }));
  } else {
    const rule = extras.rules.find((r) => r.id === plan.ruleId);
    if (!rule) return { error: "That rule is already gone." };
    const others = extras.rules.filter((r) => r.id !== plan.ruleId);
    const saveError = await saveRules(brokerId, others);
    if (saveError) return { error: saveError };
    snapshot.deletedRule = rule;
    result = await updateListings(supabase, targets, (l) => ruleRemoval(rule, others, l));
  }
  snapshot.listings = result.changed.map(snapshotOf);

  const { data: updated, error } = await createAdminClient()
    .from("listing_assistant_messages")
    .update({ status: "applied", snapshot, applied_at: new Date().toISOString() })
    .eq("id", row.id)
    .select(MESSAGE_COLUMNS)
    .single<AssistantMessageRow>();
  revalidateListings();
  if (error || !updated) return { error: error?.message ?? "Applied, but couldn't record it." };
  if (result.failed > 0) {
    return {
      error: `Applied to ${result.changed.length} car(s), but ${result.failed} couldn't be updated: ${result.lastError}`,
      message: messageView(updated),
      changed: result.changed.length,
    };
  }
  return { error: null, message: messageView(updated), changed: result.changed.length };
}

export async function cancelListingAssistantAction(id: string): Promise<{ error: string | null; message?: AssistantMessageView }> {
  const { brokerId } = await sellerContext();
  const { data, error } = await createAdminClient()
    .from("listing_assistant_messages")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("broker_id", brokerId)
    .eq("status", "proposed")
    .select(MESSAGE_COLUMNS)
    .maybeSingle<AssistantMessageRow>();
  if (error || !data) return { error: error?.message ?? "That change was already applied or cancelled." };
  return { error: null, message: messageView(data) };
}

export async function undoListingAssistantAction(id: string): Promise<{ error: string | null; message?: AssistantMessageView }> {
  const { supabase, brokerId } = await sellerContext();
  const row = await loadMessage(brokerId, id);
  if (!row || row.status !== "applied" || !row.plan || !row.snapshot) return { error: "There's nothing to undo there." };
  const { plan, snapshot } = row;

  const extras = await getExtrasWithIds(brokerId);
  if (plan.kind === "rule" && snapshot.ruleId) {
    const saveError = await saveRules(
      brokerId,
      extras.rules.filter((r) => r.id !== snapshot.ruleId)
    );
    if (saveError) return { error: saveError };
  } else if (plan.kind === "delete_rule" && snapshot.deletedRule) {
    if (!extras.rules.some((r) => r.id === snapshot.deletedRule!.id)) {
      const saveError = await saveRules(brokerId, [...extras.rules, snapshot.deletedRule]);
      if (saveError) return { error: saveError };
    }
  }

  let failed = 0;
  let lastError: string | null = null;
  await mapLimit(snapshot.listings, 6, async (s) => {
    const update =
      plan.kind === "remove"
        ? { status: s.status, removed_at: null }
        : { notes: s.notes, incentives: s.incentives, broker_fee: s.broker_fee, condition: s.condition, delivery: s.delivery };
    let query = supabase
      .from("deals")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (plan.kind === "remove") query = query.eq("status", "removed");
    const { error } = await query;
    if (error) {
      failed++;
      lastError = error.message;
    }
  });

  const { data: updated } = await createAdminClient()
    .from("listing_assistant_messages")
    .update({ status: "undone" })
    .eq("id", row.id)
    .select(MESSAGE_COLUMNS)
    .single<AssistantMessageRow>();
  revalidateListings();
  if (failed > 0) return { error: `Undone, but ${failed} car(s) couldn't be put back: ${lastError}`, message: updated ? messageView(updated) : undefined };
  return { error: null, message: updated ? messageView(updated) : undefined };
}

// The "Delete" button on a rule in the list: same as asking the assistant
// to delete it, without the AI, and undoable the same way.
export async function deleteListingRuleAction(ruleId: string): Promise<{ error: string | null; message?: AssistantMessageView }> {
  const { supabase, brokerId } = await sellerContext();
  const extras = await getExtrasWithIds(brokerId);
  const rule = extras.rules.find((r) => r.id === ruleId);
  if (!rule) return { error: "That rule is already gone." };
  const plan: AssistantPlan = { kind: "delete_rule", summary: `Delete rule: ${describeRule(rule)}`, ruleId };
  const { data: row, error } = await createAdminClient()
    .from("listing_assistant_messages")
    .insert({ broker_id: brokerId, message: "(Deleted a rule from the list)", reply: "Rule deleted.", plan, status: "proposed" })
    .select(MESSAGE_COLUMNS)
    .single<AssistantMessageRow>();
  if (error || !row) return { error: error?.message ?? "Couldn't delete the rule." };
  return applyPlan(supabase, brokerId, row, plan);
}
