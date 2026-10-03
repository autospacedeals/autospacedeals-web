// The recurring "keep this Google Sheet synced" job (triggered by
// app/api/cron/sync-sheets on a schedule). Re-fetches a broker's linked
// sheet, re-parses it, and diffs the result against that sheet's currently
// active listings (draft or published) by best-effort signature — see
// computeMatchSignature in lib/parse-inventory.ts. Leftover rows for the
// same car (year/make/model/trim) are treated as a price/terms change and
// updated in place. Anything else new gets inserted (as drafts, or
// published directly if the broker opted into auto-publish for this sheet);
// cars that disappear get soft-removed the same way a manual removal works,
// so they're recoverable from "Removed" if they come back.
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseInventoryCsv, computeMatchSignature, type ParsedDeal } from "@/lib/parse-inventory";
import { fetchGoogleSheetCsv } from "@/lib/google-sheet";
import { stageParsedDeals, type BrokerProfile } from "@/lib/deal-staging";

export interface SheetSyncRow {
  id: string;
  broker_id: string;
  sheet_url: string;
  auto_publish: boolean;
}

export interface SheetSyncResult {
  syncId: string;
  added: number;
  removed: number;
  updated: number;
  error: string | null;
}

export interface ActiveDealRow {
  id: string;
  match_signature: string | null;
  created_at: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
}

// The car itself, without its price — the signature includes payment and
// due-at-signing, so a repriced row would otherwise look like "old car
// removed, new car added" (the listing vanishing into drafts, or showing
// twice when the large-drop guard below skipped the removal).
function vehicleKey(d: { year: number; make: string; model: string; trim: string | null }): string {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [d.year, norm(d.make), norm(d.model), norm(d.trim)].join("|");
}

// If a single sync cycle would remove more than this many listings — and
// they're more than half of what's currently active for this sheet — skip
// the removals and flag it instead. Most likely explanation for a sudden
// mass disappearance is a temporarily empty/filtered/reformatted sheet, not
// the broker actually pulling most of their inventory in one shot.
// Additions still go through either way.
const MAX_UNFLAGGED_REMOVALS = 3;

// Pure reconciliation of a sheet read against the sheet's active listings —
// no I/O, so it can be exercised on its own.
export function planSheetSync(
  parsedDeals: ParsedDeal[],
  existingRows: ActiveDealRow[]
): { toInsert: ParsedDeal[]; toUpdate: { id: string; deal: ParsedDeal }[]; toRemoveIds: string[] } {
  // Group the freshly-parsed sheet rows and the currently active listings by
  // signature, then reconcile counts per signature — this also handles a
  // broker listing several identical units at the same price reasonably
  // well (matched up to the smaller count, extras added/removed as needed).
  const sheetBySignature = new Map<string, ParsedDeal[]>();
  for (const d of parsedDeals) {
    const sig = computeMatchSignature(d);
    const list = sheetBySignature.get(sig) ?? [];
    list.push(d);
    sheetBySignature.set(sig, list);
  }

  const dbBySignature = new Map<string, ActiveDealRow[]>();
  for (const row of existingRows) {
    const sig = row.match_signature ?? "";
    const list = dbBySignature.get(sig) ?? [];
    list.push(row);
    dbBySignature.set(sig, list);
  }

  const unmatchedSheet: ParsedDeal[] = [];
  const unmatchedDb: ActiveDealRow[] = [];

  const allSignatures = new Set([...sheetBySignature.keys(), ...dbBySignature.keys()]);
  for (const sig of allSignatures) {
    const sheetList = sheetBySignature.get(sig) ?? [];
    const dbList = dbBySignature.get(sig) ?? [];
    if (sheetList.length > dbList.length) {
      unmatchedSheet.push(...sheetList.slice(dbList.length));
    } else if (dbList.length > sheetList.length) {
      // Oldest-first so the listing that's genuinely been there longest is
      // the one assumed sold/removed first.
      const sorted = [...dbList].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      unmatchedDb.push(...sorted.slice(0, dbList.length - sheetList.length));
    }
  }

  // Pair leftovers for the same car: that's a repriced (or re-termed)
  // listing, so update it in place instead of remove + re-add.
  const dbByVehicle = new Map<string, ActiveDealRow[]>();
  for (const row of unmatchedDb) {
    const key = vehicleKey(row);
    const list = dbByVehicle.get(key) ?? [];
    list.push(row);
    dbByVehicle.set(key, list);
  }
  const toUpdate: { id: string; deal: ParsedDeal }[] = [];
  const toInsert: ParsedDeal[] = [];
  for (const d of unmatchedSheet) {
    const candidate = dbByVehicle.get(vehicleKey(d))?.shift();
    if (candidate) toUpdate.push({ id: candidate.id, deal: d });
    else toInsert.push(d);
  }
  const toRemoveIds = [...dbByVehicle.values()].flat().map((r) => r.id);
  return { toInsert, toUpdate, toRemoveIds };
}

export async function runSheetSync(
  supabase: SupabaseClient,
  sync: SheetSyncRow,
  broker: BrokerProfile
): Promise<SheetSyncResult> {
  const nowIso = new Date().toISOString();

  const fetched = await fetchGoogleSheetCsv(sync.sheet_url);
  if (!fetched.ok) {
    await supabase
      .from("sheet_syncs")
      .update({ last_synced_at: nowIso, last_sync_error: fetched.error })
      .eq("id", sync.id);
    return { syncId: sync.id, added: 0, removed: 0, updated: 0, error: fetched.error };
  }

  let parsedDeals: ParsedDeal[];
  let skippedCount: number;
  try {
    const result = await parseInventoryCsv(fetched.csvText, broker.state);
    parsedDeals = result.parsed;
    skippedCount = result.skipped.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse the sheet.";
    console.error(`Sheet sync ${sync.id}: parse failed:`, err);
    await supabase.from("sheet_syncs").update({ last_synced_at: nowIso, last_sync_error: message }).eq("id", sync.id);
    return { syncId: sync.id, added: 0, removed: 0, updated: 0, error: message };
  }

  // A totally empty read (no rows parsed AND none skipped) almost always
  // means something went wrong with the fetch/read itself — never treat
  // "we read nothing" as "delete everything."
  if (parsedDeals.length === 0 && skippedCount === 0) {
    const message = "Last check found no rows on the sheet's first tab — skipped to avoid removing everything.";
    await supabase.from("sheet_syncs").update({ last_synced_at: nowIso, last_sync_error: message }).eq("id", sync.id);
    return { syncId: sync.id, added: 0, removed: 0, updated: 0, error: message };
  }

  const { data: existingRows, error: fetchExistingError } = await supabase
    .from("deals")
    .select("id, match_signature, created_at, year, make, model, trim")
    .eq("sheet_sync_id", sync.id)
    .in("status", ["draft", "published"])
    .returns<ActiveDealRow[]>();

  if (fetchExistingError) {
    console.error(`Sheet sync ${sync.id}: failed to load existing deals:`, fetchExistingError.message);
    await supabase
      .from("sheet_syncs")
      .update({ last_synced_at: nowIso, last_sync_error: fetchExistingError.message })
      .eq("id", sync.id);
    return { syncId: sync.id, added: 0, removed: 0, updated: 0, error: fetchExistingError.message };
  }

  const { toInsert, toUpdate, toRemoveIds } = planSheetSync(parsedDeals, existingRows ?? []);

  let updatedCount = 0;
  for (const { id, deal: d } of toUpdate) {
    const { error: updateError } = await supabase
      .from("deals")
      .update({
        payment: d.payment,
        due_at_signing: d.dueAtSigning,
        msrp: d.msrp,
        term: d.term,
        miles_per_year: d.milesPerYear,
        broker_fee: d.brokerFee,
        one_pay: d.onePay,
        match_signature: computeMatchSignature(d),
        updated_at: nowIso,
      })
      .eq("id", id);
    if (updateError) {
      console.error(`Sheet sync ${sync.id}: failed to update deal ${id}:`, updateError.message);
    } else {
      updatedCount++;
    }
  }

  const activeCount = existingRows?.length ?? 0;
  let removalsSkipped = false;
  let removedCount = 0;
  if (toRemoveIds.length > 0) {
    const tooMany = toRemoveIds.length > MAX_UNFLAGGED_REMOVALS && toRemoveIds.length > activeCount * 0.5;
    if (tooMany) {
      removalsSkipped = true;
    } else {
      const { error: removeError, data: removedRows } = await supabase
        .from("deals")
        .update({ status: "removed", removed_at: nowIso })
        .in("id", toRemoveIds)
        .select("id");
      if (removeError) {
        console.error(`Sheet sync ${sync.id}: failed to remove deals:`, removeError.message);
      } else {
        removedCount = removedRows?.length ?? 0;
      }
    }
  }

  let addedCount = 0;
  if (toInsert.length > 0) {
    const staging = await stageParsedDeals(supabase, sync.broker_id, broker, null, toInsert, {
      status: sync.auto_publish ? "published" : "draft",
      sheetSyncId: sync.id,
    });
    addedCount = staging.staged;
  }

  const lastSyncError = removalsSkipped
    ? `Skipped removing ${toRemoveIds.length} listing(s) this check — that's an unusually large drop, so it was left alone for you to review instead of auto-removing.`
    : null;

  await supabase
    .from("sheet_syncs")
    .update({
      last_synced_at: nowIso,
      last_sync_added: addedCount,
      last_sync_removed: removedCount,
      last_sync_error: lastSyncError,
    })
    .eq("id", sync.id);

  return { syncId: sync.id, added: addedCount, removed: removedCount, updated: updatedCount, error: lastSyncError };
}
