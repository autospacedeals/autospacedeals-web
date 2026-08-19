// Recurring Google Sheet sync endpoint. Not triggered by Vercel Cron
// directly (Vercel's Hobby plan only allows once-a-day schedules) — instead
// a GitHub Actions workflow (.github/workflows/sync-broker-sheets.yml) hits
// this every ~30 minutes with a shared secret. See lib/sheet-sync.ts for the
// actual reconciliation logic.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runSheetSync, type SheetSyncRow } from "@/lib/sheet-sync";
import type { BrokerProfile } from "@/lib/deal-staging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface BrokerRow extends BrokerProfile {
  id: string;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SYNC_SECRET;
  if (!secret) return false; // refuse to run at all if it isn't configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// TEMPORARY: lengths/booleans only, never the actual secret — just enough
// to tell a length/whitespace mismatch apart from a wrong value apart from
// a missing env var, without leaking anything sensitive. Remove once the
// 401 mismatch is sorted out.
function authDebugInfo(request: NextRequest) {
  const secret = process.env.CRON_SYNC_SECRET ?? null;
  const header = request.headers.get("authorization");
  return {
    hasSecretEnv: secret !== null,
    secretLength: secret?.length ?? null,
    headerPresent: header !== null,
    headerLength: header?.length ?? null,
    headerStartsWithBearer: header?.startsWith("Bearer ") ?? null,
    matches: secret !== null && header === `Bearer ${secret}`,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized", debug: authDebugInfo(request) }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: syncs, error: syncsError } = await supabase
    .from("sheet_syncs")
    .select("id, broker_id, sheet_url, auto_publish")
    .eq("active", true)
    .returns<SheetSyncRow[]>();

  if (syncsError) {
    console.error("Cron sync-sheets: failed to load sheet_syncs:", syncsError.message);
    return NextResponse.json({ error: syncsError.message }, { status: 500 });
  }

  const results: Array<{ syncId: string; added: number; removed: number; error: string | null }> = [];

  for (const sync of syncs ?? []) {
    try {
      const { data: broker } = await supabase
        .from("brokers")
        .select("id, business_name, seller_type, dealership_name, contact_phone, city, state")
        .eq("id", sync.broker_id)
        .single<BrokerRow>();

      if (!broker) {
        results.push({ syncId: sync.id, added: 0, removed: 0, error: "Broker profile not found" });
        continue;
      }

      const { data: authUser } = await supabase.auth.admin.getUserById(sync.broker_id);
      const result = await runSheetSync(supabase, sync, broker, authUser?.user?.email ?? undefined);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Cron sync-sheets: sync ${sync.id} threw:`, err);
      results.push({ syncId: sync.id, added: 0, removed: 0, error: message });
    }
  }

  return NextResponse.json({ checked: syncs?.length ?? 0, results });
}
