"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { Incentive } from "@/lib/deals-data";
import { parseJsonField, sanitizeIncentives, sanitizeLeaseOptions, sanitizeMileageOptions } from "@/lib/deal-options";
import { TOTAL_PRICE_REQUIRED_ERROR, carsActError, needsTotalPrice } from "@/lib/cars-act";
import { parseLocationFields } from "@/lib/deal-location";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { alertAdminsFirstListing } from "@/lib/admin-alerts";
import { slugify, parseMsrpInput } from "@/lib/deal-utils";
import { fetchCarsxePhoto, fetchCarsxePhotos } from "@/lib/carsxe";
import { parseInventoryBuffer, parseTabs, type ParsedDeal, type SkippedRow, type TabRowCache } from "@/lib/parse-inventory";
import {
  parseFreeTextWithAI,
  parseImageWithAI,
  type SupportedImageType,
} from "@/lib/ai-parse-inventory";
import { fetchGoogleSheetTabs } from "@/lib/google-sheet";
import { stageParsedDeals, type BrokerProfile } from "@/lib/deal-staging";
import { applyDealExtras, getDealExtras } from "@/lib/deal-disclaimers";
import { runSheetSync, SHEET_SYNC_COLUMNS, type SheetSyncRow } from "@/lib/sheet-sync";
import { normalizeModelTrim } from "@/lib/vehicle-names";

// A skipped row's reason, naming its tab when the sheet has more than one.
function skipReason(s: SkippedRow, multiTab: boolean): string {
  return multiTab && s.tab ? `${s.tab} tab, row ${s.row}: ${s.reason}` : s.reason;
}

// Supabase Storage rejects object keys containing spaces, colons, and other
// punctuation — which is exactly what Mac/Windows screenshot and export
// filenames are full of (e.g. "Screenshot 2026-08-17 at 3.20.24 PM.png").
// That was silently breaking every screenshot/spreadsheet upload whose
// original filename wasn't already storage-safe, surfacing as a raw
// "Invalid key: ..." error. Strip it down to a safe, storage-key-friendly
// name instead of trusting the original filename.
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

// Skip reasons only ever showed up as a bare count to the broker ("1 row
// couldn't be read automatically") — logging the actual reason server-side
// so a specific parsing gap (like the one-pay lease case) is diagnosable
// from Vercel logs instead of a guessing game.
function logSkippedRows(source: string, skipped: { row: number; reason: string }[]) {
  if (skipped.length === 0) return;
  console.warn(
    `${source}: ${skipped.length} row(s) skipped —`,
    skipped.map((s) => `row ${s.row}: ${s.reason}`).join("; ")
  );
}

const SUPPORTED_IMAGE_TYPES: SupportedImageType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export type SubmissionState = {
  error: string | null;
  success?: boolean;
  submissionId?: string;
  parsedCount?: number;
  skippedCount?: number;
  // Why each unread row was skipped, shown directly to the broker instead
  // of just a bare count — makes a specific parsing gap self-diagnosable
  // without digging through server logs.
  skipReasons?: string[];
  // Whatever fields the parser DID manage to read for each skipped row
  // (same order as skipReasons), so the fallback manual-entry form can come
  // pre-filled with everything except the one thing it couldn't determine,
  // instead of asking the broker to retype a row that was mostly readable.
  skippedDeals?: Partial<ParsedDeal>[];
  // Whether this Google Sheet was set up for recurring auto-sync.
  sheetSynced?: boolean;
};

// Broker edits the "about" text shown on their public profile page
// (/brokers/[id]) — everything else there (business name, city/state,
// phone) is already editable via their account/signup info.
export async function updateBrokerAboutAction(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const about = String(formData.get("about") || "").trim() || null;

  const { error } = await supabase.from("brokers").update({ about }).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  revalidatePath(`/brokers/${user.id}`);
  return { error: null };
}

// Called from the "Re-pull photo" button in MyListings when a listing's
// auto-sourced photo doesn't show the whole car (a close-up, interior, or
// engine-bay shot). Hands back a CarsXE photo the listing isn't already
// using — each click steps to the next one — falling back to the same car
// without the trim filter for more options. It doesn't touch the deal row
// itself: the broker still reviews it and hits Save like any other edit.
export async function repullPhotoAction(input: {
  year: number;
  make: string;
  model: string;
  trim?: string;
  // The listing's exterior color — photos in that color come first.
  color?: string;
  current?: string[];
}): Promise<{ imageUrl: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  if (!input.year || !input.make.trim() || !input.model.trim()) {
    return { imageUrl: null, error: "Fill in year, make, and model first." };
  }

  const current = new Set((input.current ?? []).slice(0, 20).map((u) => String(u).trim()));
  const vehicle = {
    year: input.year,
    make: input.make,
    model: input.model,
    color: typeof input.color === "string" ? input.color.slice(0, 80) : undefined,
  };
  let photos = await fetchCarsxePhotos({ ...vehicle, trim: input.trim });
  let fresh = photos.find((url) => !current.has(url));
  if (!fresh && input.trim) {
    photos = await fetchCarsxePhotos(vehicle);
    fresh = photos.find((url) => !current.has(url));
  }

  if (!fresh) {
    return {
      imageUrl: null,
      error:
        current.size > 0
          ? "No other photos found for this car — you can paste a photo URL instead."
          : "Couldn't find a photo for this exact year/make/model/trim.",
    };
  }
  return { imageUrl: fresh, error: null };
}

// Who's editing a listing: the broker (their own rows only, through their
// own session) or a Drive admin from /admin/listings (any broker's row,
// through the service role — checked against the admin list here, never
// trusted from the form).
async function dealEditor(asAdmin: boolean): Promise<{ client: SupabaseClient; brokerId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (asAdmin) {
    if (!user || !(await isAdminEmail(user.email))) redirect("/admin/login");
    return { client: createAdminClient(), brokerId: null };
  }
  if (!user) redirect("/broker/login");
  return { client: supabase, brokerId: user.id };
}

function revalidateListings() {
  revalidatePath("/broker/dashboard");
  revalidatePath("/admin/listings");
  revalidatePath("/");
}

// Parses the hidden `incentives` field (JSON string written by
// IncentivesEditor) that every deal-editing form submits, tolerating a
// missing/invalid value rather than throwing.
function parseIncentivesField(formData: FormData): Incentive[] {
  return sanitizeIncentives(parseJsonField(formData, "incentives"));
}

// Google Sheet / Excel file / pasted text / screenshot. We try to pull
// individual cars out of the source into draft listings the broker can
// review and confirm — see lib/parse-inventory.ts. If parsing comes up
// empty, the broker gets the structured "add a car" form to fill in
// themselves instead — see createManualDealAction below. Either way,
// nothing needs your approval.
export async function createSubmissionAction(
  _prevState: SubmissionState,
  formData: FormData
): Promise<SubmissionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const { data: broker } = await supabase
    .from("brokers")
    .select("business_name, seller_type, dealership_name, city, state")
    .eq("id", user.id)
    .single<BrokerProfile>();

  const sourceType = String(formData.get("sourceType") || "google_sheet");
  // Forum/website links are no longer accepted — only sources we can read
  // the cars out of directly. (Older "link" submissions stay viewable in
  // the admin queue.)
  if (!["google_sheet", "excel_file", "free_text", "screenshot"].includes(sourceType)) {
    return { error: "Choose a Google Sheet, an Excel file, pasted text, or a screenshot." };
  }
  const notes = String(formData.get("notes") || "").trim() || null;
  let sourceUrl = "";
  let parsedDeals: ParsedDeal[] = [];
  let skippedCount = 0;
  let skipReasons: string[] = [];
  let skippedDeals: Partial<ParsedDeal>[] = [];
  let sheetTabs: string[] = [];
  let skippedTabs: string[] = [];
  let sheetRowCache: TabRowCache = {};

  if (sourceType === "excel_file") {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { error: "Please choose a file to upload." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { error: "File is too large — please keep it under 10MB." };
    }

    if (broker) {
      try {
        const buffer = await file.arrayBuffer();
        const result = await parseInventoryBuffer(buffer, broker.state);
        parsedDeals = result.parsed;
        skippedCount = result.skipped.length;
        const multiTab = new Set(result.skipped.map((s) => s.tab)).size > 1;
        skipReasons = result.skipped.map((s) => skipReason(s, multiTab));
        skippedDeals = result.skipped.map((s) => s.partial);
        logSkippedRows("excel_file", result.skipped);
        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We opened the file but couldn't find any rows in it — check the file and try again, or add cars manually below.",
          };
        }
      } catch (err) {
        console.error("Failed to parse uploaded inventory file:", err);
        const message = err instanceof Error ? err.message : null;
        return {
          error: `Couldn't read that file${message ? ` (${message})` : ""} — make sure it's a valid .xlsx, .xls, or .csv, or add cars manually below.`,
        };
      }
    }

    const path = `${user.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("broker-uploads")
      .upload(path, file);
    if (uploadError) return { error: uploadError.message };

    sourceUrl = path;
  } else if (sourceType === "google_sheet") {
    sourceUrl = String(formData.get("sourceUrl") || "").trim();
    if (!sourceUrl) return { error: "Please enter a link." };
    try {
      new URL(sourceUrl);
    } catch {
      return { error: "That doesn't look like a valid URL." };
    }

    if (sourceType === "google_sheet") {
      if (!broker) {
        return { error: "Couldn't find your broker profile — try signing in again." };
      }

      const fetched = await fetchGoogleSheetTabs(sourceUrl);
      if (!fetched.ok) {
        return { error: fetched.error };
      }
      sheetTabs = fetched.tabs.map((t) => t.name);
      // The tabs the broker picked in step one (listSheetTabsAction); all of
      // them if none came through. Only those tabs' cars are read.
      const picked = new Set(formData.getAll("tabs").map(String));
      const tabsToRead = picked.size ? fetched.tabs.filter((t) => picked.has(t.name)) : fetched.tabs;
      skippedTabs = picked.size ? sheetTabs.filter((t) => !picked.has(t)) : [];

      try {
        const result = await parseTabs(tabsToRead, broker.state);
        parsedDeals = result.parsed;
        sheetRowCache = result.cache;
        skippedCount = result.skipped.length;
        const multiTab = tabsToRead.length > 1;
        skipReasons = result.skipped.map((s) => skipReason(s, multiTab));
        skippedDeals = result.skipped.map((s) => s.partial);
        logSkippedRows("google_sheet", result.skipped);

        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We opened the sheet but couldn't find any rows on its tabs (hidden tabs are skipped). Check the sheet, or add cars manually below.",
          };
        }
      } catch (err) {
        console.error("Failed to parse Google Sheet:", err);
        return {
          error: "Couldn't read that Google Sheet — double-check the link and sharing settings, or add cars manually below.",
        };
      }
    }
  } else if (sourceType === "free_text") {
    const dealText = String(formData.get("dealText") || "").trim();
    if (!dealText) return { error: "Paste in the deal details first." };
    if (!process.env.ANTHROPIC_API_KEY) {
      return { error: "AI reading isn't configured yet — please use \"Add a car manually\" instead." };
    }

    if (broker) {
      try {
        const result = await parseFreeTextWithAI(dealText, broker.state);
        parsedDeals = result.parsed;
        skippedCount = result.skipped.length;
        skipReasons = result.skipped.map((s) => s.reason);
        skippedDeals = result.skipped.map((s) => s.partial);
        logSkippedRows("free_text", result.skipped);
        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We couldn't find a car in that text — try including the year, make, model, and pricing/terms, or add it manually below.",
          };
        }
      } catch (err) {
        console.error("Failed to AI-parse typed deal text:", err);
        return { error: "Couldn't read that — please try again or use \"Add a car manually.\"" };
      }
    }

    sourceUrl = dealText.slice(0, 2000);
  } else if (sourceType === "screenshot") {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { error: "Please choose a screenshot to upload." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { error: "Image is too large — please keep it under 10MB." };
    }
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type as SupportedImageType)) {
      return { error: "Please upload a JPEG, PNG, WEBP, or GIF image." };
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return { error: "AI reading isn't configured yet — please use \"Add a car manually\" instead." };
    }

    if (broker) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await parseImageWithAI(buffer, broker.state);
        parsedDeals = result.parsed;
        skippedCount = result.skipped.length;
        skipReasons = result.skipped.map((s) => s.reason);
        skippedDeals = result.skipped.map((s) => s.partial);
        logSkippedRows("screenshot", result.skipped);
        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We couldn't find a car in that screenshot — make sure the pricing/terms are legible, or add it manually below.",
          };
        }
      } catch (err) {
        console.error("Failed to AI-parse screenshot:", err);
        const message = err instanceof Error ? err.message : "Couldn't read that image.";
        return { error: `${message} Please try again or use "Add a car manually."` };
      }
    }

    const path = `${user.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("broker-uploads").upload(path, file);
    if (uploadError) return { error: uploadError.message };

    sourceUrl = path;
  } else {
    return { error: "Unknown source type." };
  }

  const { data: inserted, error } = await supabase
    .from("submissions")
    .insert({
      broker_id: user.id,
      source_type: sourceType,
      source_url: sourceUrl,
      notes,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { error: error.message };

  // Google Sheet links can opt into a recurring check (every ~30 min) that
  // adds new rows and removes ones that disappear from the sheet — see
  // app/api/cron/sync-sheets. A synced sheet's cars go live right away,
  // this first batch included; other sources land as drafts for review.
  let sheetSyncId: string | null = null;
  if (sourceType === "google_sheet" && formData.get("keepSynced") === "on") {
    const { data: sync, error: syncError } = await supabase
      .from("sheet_syncs")
      .insert({
        broker_id: user.id,
        sheet_url: sourceUrl,
        auto_publish: true,
        tabs: sheetTabs,
        // Tabs left unchecked stay off until the broker switches them on.
        disabled_tabs: skippedTabs,
        // So the first scheduled check doesn't re-read every row.
        row_cache: sheetRowCache,
      })
      .select("id")
      .single<{ id: string }>();
    if (syncError) {
      console.error("Failed to create sheet sync:", syncError.message);
    } else {
      sheetSyncId = sync.id;
    }
  }

  let stageFailed = 0;
  let stageLastError: string | null = null;
  if (broker && parsedDeals.length > 0 && inserted) {
    const staging = await stageParsedDeals(supabase, user.id, broker, inserted.id, parsedDeals, {
      sheetSyncId,
      status: sheetSyncId ? "published" : "draft",
    });
    stageFailed = staging.failed;
    stageLastError = staging.lastError;
    if (sheetSyncId && staging.staged > 0) after(() => alertAdminsFirstListing(user.id));
  }

  revalidatePath("/broker/dashboard");

  // Every parsed car failed to save as a draft — this is a real backend
  // problem (e.g. a database migration that hasn't been run), not "no cars
  // found," so it needs to say so rather than quietly claiming success.
  if (parsedDeals.length > 0 && stageFailed === parsedDeals.length) {
    return {
      error: `We read ${parsedDeals.length} car${parsedDeals.length === 1 ? "" : "s"} but couldn't save ${
        parsedDeals.length === 1 ? "it" : "them"
      } as drafts (${stageLastError ?? "unknown error"}). This looks like an issue on our end — contact support if it keeps happening, or add the car(s) manually below in the meantime.`,
    };
  }

  return {
    error: null,
    success: true,
    submissionId: inserted?.id,
    parsedCount: parsedDeals.length - stageFailed,
    skippedCount: skippedCount + stageFailed,
    skipReasons,
    skippedDeals,
    sheetSynced: sheetSyncId !== null,
  };
}

// Step one of linking a Google Sheet: just the tab names (and how many
// rows each has), read without the AI, so the broker can pick which tabs to
// import before any cars are read.
export async function listSheetTabsAction(
  sheetUrl: string
): Promise<{ error: string | null; notShared?: boolean; tabs?: { name: string; rows: number }[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");
  const url = sheetUrl.trim();
  if (!url) return { error: "Paste your Google Sheet link first." };
  const fetched = await fetchGoogleSheetTabs(url);
  if (!fetched.ok) return { error: fetched.error, notShared: fetched.notShared };
  if (fetched.tabs.length === 0) return { error: "We opened the sheet but every tab is hidden or empty." };
  return { error: null, tabs: fetched.tabs.map((t) => ({ name: t.name, rows: t.rows.length })) };
}

// Google Sheet auto-sync management — pause/resume, toggle auto-publish, or
// unlink entirely. See app/api/cron/sync-sheets for the recurring job these
// control.
export async function toggleSheetSyncActiveAction(
  id: string,
  active: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");
  if (!id) return { error: "Missing sync id." };

  const { error } = await supabase.from("sheet_syncs").update({ active }).eq("id", id).eq("broker_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  return { error: null };
}

// Unlinking stops future sync checks but doesn't touch any listings already
// created from this sheet — they stay live/draft/removed exactly as they
// are, just no longer tied to an active sync (the foreign key clears on its
// own via ON DELETE SET NULL).
export async function deleteSheetSyncAction(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");
  if (!id) return { error: "Missing sync id." };

  const { error } = await supabase.from("sheet_syncs").delete().eq("id", id).eq("broker_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  return { error: null };
}

// Switches one tab of a synced sheet off or on. Off: its cars come down
// right away and later checks skip it. On: the sheet is checked right away
// so the tab's cars come back without waiting for the next scheduled check.
export async function setSheetTabEnabledAction(
  id: string,
  tab: string,
  enabled: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");
  if (!id || !tab) return { error: "Missing sheet or tab." };

  const { data: sync } = await supabase
    .from("sheet_syncs")
    .select("id, tabs, disabled_tabs, active")
    .eq("id", id)
    .eq("broker_id", user.id)
    .maybeSingle<{ id: string; tabs: string[]; disabled_tabs: string[]; active: boolean }>();
  if (!sync) return { error: "Couldn't find that sheet." };

  const disabled = new Set(sync.disabled_tabs ?? []);
  if (enabled) disabled.delete(tab);
  else disabled.add(tab);
  const { error } = await supabase
    .from("sheet_syncs")
    .update({ disabled_tabs: [...disabled] })
    .eq("id", id)
    .eq("broker_id", user.id);
  if (error) return { error: error.message };

  if (!enabled) {
    // Cars from before tabs were tracked have no tab yet; they came from
    // the first tab (the only one read back then).
    const nowIso = new Date().toISOString();
    const base = () =>
      supabase
        .from("deals")
        .update({ status: "removed", removed_at: nowIso })
        .eq("sheet_sync_id", id)
        .eq("broker_id", user.id)
        .in("status", ["draft", "published"]);
    const { error: removeError } = await base().eq("sheet_tab", tab);
    if (removeError) return { error: removeError.message };
    if (sync.tabs?.[0] === tab) await base().is("sheet_tab", null);
  } else if (sync.active) {
    const admin = createAdminClient();
    const [{ data: row }, { data: broker }] = await Promise.all([
      admin.from("sheet_syncs").select(SHEET_SYNC_COLUMNS).eq("id", id).single<SheetSyncRow>(),
      admin
        .from("brokers")
        .select("business_name, seller_type, dealership_name, city, state")
        .eq("id", user.id)
        .single<BrokerProfile>(),
    ]);
    if (row && broker) await runSheetSync(admin, row, broker);
  }

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
  return { error: null };
}

// "Add a car manually" — structured, trusted input from an authenticated
// broker, so it publishes straight to the live site, no review queue.
// Optionally tagged with the submission it came from (when a broker is
// entering cars right after linking a source) purely for your reference.
export async function createManualDealAction(
  _prevState: SubmissionState,
  formData: FormData
): Promise<SubmissionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const submissionId = String(formData.get("submissionId") || "").trim() || null;

  const { data: broker } = await supabase
    .from("brokers")
    .select("business_name, seller_type, dealership_name, city, state")
    .eq("id", user.id)
    .single<{
      business_name: string;
      seller_type: string;
      dealership_name: string | null;
      city: string;
      state: string;
    }>();
  if (!broker) return { error: "Couldn't find your broker profile — try signing in again." };

  const year = Number(formData.get("year"));
  const { make, model, trim } = normalizeModelTrim({
    make: String(formData.get("make") || "").trim(),
    model: String(formData.get("model") || "").trim(),
    trim: String(formData.get("trim") || "").trim() || null,
  });
  const bodyStyle = String(formData.get("bodyStyle") || "").trim() || null;
  const fuel = String(formData.get("fuel") || "").trim() || null;
  const exterior = String(formData.get("exterior") || "").trim() || null;
  const interior = String(formData.get("interior") || "").trim() || null;
  const dealType = String(formData.get("dealType") || "Lease").trim();
  const onePay = formData.get("onePay") === "on";
  const payment = onePay ? 0 : Number(formData.get("payment"));
  const dueAtSigning = Number(formData.get("dueAtSigning"));
  const dueAtSigningTaxRateRaw = formData.get("dueAtSigningTaxRate");
  const dueAtSigningTaxRate = dueAtSigningTaxRateRaw ? Number(dueAtSigningTaxRateRaw) : null;
  const paymentTaxRateRaw = formData.get("paymentTaxRate");
  const paymentTaxRate = paymentTaxRateRaw ? Number(paymentTaxRateRaw) : null;
  const brokerFeeRaw = formData.get("brokerFee");
  const brokerFee = brokerFeeRaw ? Number(brokerFeeRaw) : null;
  const msd = parseMsdFields(formData);
  if ("error" in msd) return { error: msd.error };
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const { msrp, maskMsrp, msrpMaskedLabel } = parseMsrpInput(String(formData.get("msrp") || ""));
  const sellingPriceRaw = formData.get("sellingPrice");
  const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;
  if (needsTotalPrice(broker.seller_type) && !(sellingPrice && sellingPrice > 0)) {
    return { error: TOTAL_PRICE_REQUIRED_ERROR };
  }
  const notes = String(formData.get("notes") || "").trim();
  const condition = String(formData.get("condition") || "").trim() || null;
  const incentives = parseIncentivesField(formData);
  const mileageOptions =
    dealType === "Lease" ? sanitizeMileageOptions(parseJsonField(formData, "mileageOptions"), milesPerYear) : [];
  const leaseOptions =
    dealType === "Lease" && !onePay
      ? sanitizeLeaseOptions(parseJsonField(formData, "leaseOptions"), { term, milesPerYear })
      : [];
  const location = parseLocationFields(formData, { city: broker.city, state: broker.state });
  if ("error" in location) return { error: location.error };
  let images = String(formData.get("images") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!year || !make || !model) {
    return { error: "Please fill in the year, make, and model." };
  }
  if (!msrp) {
    return { error: "Please enter the MSRP." };
  }
  if (!dueAtSigning || !term) {
    return { error: "Please fill in the deal terms (due at signing and term)." };
  }
  if (!onePay && !payment) {
    return { error: "Please enter a monthly payment, or mark this as a one-pay lease." };
  }
  if (dealType === "Lease" && !milesPerYear) {
    return { error: "Please enter the miles per year for this lease." };
  }
  for (const url of images) {
    try {
      new URL(url);
    } catch {
      return { error: `"${url}" doesn't look like a valid photo URL.` };
    }
  }

  const photoAutoSourced = images.length === 0;
  if (images.length === 0) {
    const photo = await fetchCarsxePhoto({ year, make, model, trim: trim ?? undefined, color: exterior });
    if (photo) images = [photo];
  }

  // The broker's standing extras (incentive rules, disclosures) by make.
  const extras = applyDealExtras({ make, model, trim, notes, incentives }, await getDealExtras(user.id));

  const slug = slugify([year, make, model, trim ?? "", location.state]);

  const { error } = await supabase.from("deals").insert({
    slug,
    broker_id: user.id,
    submission_id: submissionId,
    year,
    make,
    model,
    trim,
    body_style: bodyStyle,
    fuel,
    exterior,
    interior,
    deal_type: dealType,
    msrp,
    selling_price: sellingPrice,
    payment,
    due_at_signing: dueAtSigning,
    due_at_signing_tax_rate: dueAtSigningTaxRate,
    payment_tax_rate: paymentTaxRate,
    mask_msrp: maskMsrp,
    msrp_masked_label: msrpMaskedLabel,
    broker_fee: brokerFee,
    msd_count: msd.msdCount,
    msd_total: msd.msdTotal,
    term,
    miles_per_year: milesPerYear,
    apr,
    seller_type: broker.seller_type,
    seller_name: broker.business_name,
    seller_dealership: broker.dealership_name,
    verified: true,
    condition,
    incentives: extras.incentives,
    mileage_options: mileageOptions,
    lease_options: leaseOptions,
    city: location.city,
    state: location.state,
    delivery: location.delivery,
    photo_auto_sourced: photoAutoSourced,
    in_stock: true,
    popularity: 50,
    notes: extras.notes,
    images,
    one_pay: onePay,
    status: "published",
  });
  if (error) return { error: carsActError(error.message) };
  after(() => alertAdminsFirstListing(user.id));

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
  return { error: null, success: true, submissionId: submissionId ?? undefined };
}

// -----------------------------------------------------------------------------
// Managing already-published (or draft) listings
// -----------------------------------------------------------------------------

export async function updateDealAction(formData: FormData): Promise<{ error: string | null }> {
  const { client, brokerId } = await dealEditor(formData.get("asAdmin") === "1");

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing deal id." };

  const year = Number(formData.get("year"));
  const { make, model, trim } = normalizeModelTrim({
    make: String(formData.get("make") || "").trim(),
    model: String(formData.get("model") || "").trim(),
    trim: String(formData.get("trim") || "").trim() || null,
  });
  const bodyStyle = String(formData.get("bodyStyle") || "").trim() || null;
  const fuel = String(formData.get("fuel") || "").trim() || null;
  const exterior = String(formData.get("exterior") || "").trim() || null;
  const interior = String(formData.get("interior") || "").trim() || null;
  const dealType = String(formData.get("dealType") || "Lease").trim();
  const onePay = formData.get("onePay") === "on";
  const payment = onePay ? 0 : Number(formData.get("payment"));
  const dueAtSigning = Number(formData.get("dueAtSigning"));
  const dueAtSigningTaxRateRaw = formData.get("dueAtSigningTaxRate");
  const dueAtSigningTaxRate = dueAtSigningTaxRateRaw ? Number(dueAtSigningTaxRateRaw) : null;
  const paymentTaxRateRaw = formData.get("paymentTaxRate");
  const paymentTaxRate = paymentTaxRateRaw ? Number(paymentTaxRateRaw) : null;
  const brokerFeeRaw = formData.get("brokerFee");
  const brokerFee = brokerFeeRaw ? Number(brokerFeeRaw) : null;
  const msd = parseMsdFields(formData);
  if ("error" in msd) return { error: msd.error };
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const { msrp, maskMsrp, msrpMaskedLabel } = parseMsrpInput(String(formData.get("msrp") || ""));
  const sellingPriceRaw = formData.get("sellingPrice");
  const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;
  const inStock = formData.get("inStock") === "on";
  const notes = String(formData.get("notes") || "").trim();
  const condition = String(formData.get("condition") || "").trim() || null;
  const incentives = parseIncentivesField(formData);
  const mileageOptions =
    dealType === "Lease" ? sanitizeMileageOptions(parseJsonField(formData, "mileageOptions"), milesPerYear) : [];
  const leaseOptions =
    dealType === "Lease" && !onePay
      ? sanitizeLeaseOptions(parseJsonField(formData, "leaseOptions"), { term, milesPerYear })
      : [];
  const location = parseLocationFields(formData);
  if ("error" in location) return { error: location.error };
  const images = String(formData.get("images") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!year || !make || !model) {
    return { error: "Please fill in the year, make, and model." };
  }
  if (!msrp) {
    return { error: "Please enter the MSRP." };
  }
  if (!dueAtSigning || !term) {
    return { error: "Please fill in the deal terms (due at signing and term)." };
  }
  if (!onePay && !payment) {
    return { error: "Please enter a monthly payment, or mark this as a one-pay lease." };
  }
  if (dealType === "Lease" && !milesPerYear) {
    return { error: "Please enter the miles per year for this lease." };
  }
  for (const url of images) {
    try {
      new URL(url);
    } catch {
      return { error: `"${url}" doesn't look like a valid photo URL.` };
    }
  }

  let finalImages = images;
  const photoAutoSourced = images.length === 0;
  if (finalImages.length === 0) {
    const photo = await fetchCarsxePhoto({ year, make, model, trim: trim ?? undefined, color: exterior });
    if (photo) finalImages = [photo];
  }

  let query = client
    .from("deals")
    .update({
      year,
      make,
      model,
      trim,
      body_style: bodyStyle,
      fuel,
      exterior,
      interior,
      deal_type: dealType,
      msrp,
      selling_price: sellingPrice,
      payment,
      due_at_signing: dueAtSigning,
      due_at_signing_tax_rate: dueAtSigningTaxRate,
      payment_tax_rate: paymentTaxRate,
      mask_msrp: maskMsrp,
      msrp_masked_label: msrpMaskedLabel,
      broker_fee: brokerFee,
      msd_count: msd.msdCount,
      msd_total: msd.msdTotal,
      term,
      miles_per_year: milesPerYear,
      apr,
      in_stock: inStock,
      notes,
      condition,
      incentives,
      mileage_options: mileageOptions,
      lease_options: leaseOptions,
      city: location.city,
      state: location.state,
      delivery: location.delivery,
      images: finalImages,
      photo_auto_sourced: photoAutoSourced,
      one_pay: onePay,
    })
    .eq("id", id);
  if (brokerId) query = query.eq("broker_id", brokerId);
  const { error } = await query;

  if (error) return { error: carsActError(error.message) };
  revalidateListings();
  return { error: null };
}

// Deletes a submission log entry (and its uploaded file, if any) — this is
// just the reference record of what a broker linked/uploaded/typed, not the
// deals it may have produced, so it's always safe to remove.
export async function deleteSubmissionAction(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing submission id." };

  const { data: submission } = await supabase
    .from("submissions")
    .select("source_type, source_url, status")
    .eq("id", id)
    .eq("broker_id", user.id)
    .single<{ source_type: string; source_url: string | null; status: string }>();

  // RLS only allows brokers to delete their own PENDING submissions (approved/
  // rejected ones stay for the review trail). Trying to delete anything else
  // fails silently at the database level — zero rows removed, no error — so
  // check the row count ourselves and surface a real message instead of
  // letting the button appear to do nothing.
  const { error, data: deletedRows } = await supabase
    .from("submissions")
    .delete()
    .eq("id", id)
    .eq("broker_id", user.id)
    .select("id");
  if (error) return { error: error.message };
  if (!deletedRows || deletedRows.length === 0) {
    return {
      error:
        submission && submission.status !== "pending"
          ? "Only pending submissions can be deleted — this one has already been reviewed."
          : "Couldn't delete that submission — it may have already been removed. Refresh and try again.",
    };
  }

  if (submission?.source_url && (submission.source_type === "excel_file" || submission.source_type === "screenshot")) {
    await supabase.storage.from("broker-uploads").remove([submission.source_url]);
  }

  revalidatePath("/broker/dashboard");
  return { error: null };
}

// Soft-delete: marks the listing 'removed' and stamps removed_at instead of
// deleting the row outright, so it shows up in the broker's "Removed
// listings" history (with when it went live and when it came down) and can
// be restored if it was taken down by mistake.
export async function deleteDealAction(formData: FormData): Promise<{ error: string | null }> {
  const { client, brokerId } = await dealEditor(formData.get("asAdmin") === "1");

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing deal id." };

  let query = client
    .from("deals")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("id", id);
  if (brokerId) query = query.eq("broker_id", brokerId);
  const { error } = await query;
  if (error) return { error: error.message };

  revalidateListings();
  return { error: null };
}

// Bulk version for the "select multiple rows, delete" flow in the spreadsheet
// view of the broker's listings. Scoped to the caller's own rows the same
// way the single-delete action is, so a broker can never delete someone
// else's listing even if IDs were tampered with client-side.
export async function deleteDealsAction(
  ids: string[],
  asAdmin = false
): Promise<{ error: string | null; deletedCount: number }> {
  const { client, brokerId } = await dealEditor(asAdmin);

  const cleanIds = ids.filter(Boolean);
  if (cleanIds.length === 0) return { error: "No listings selected.", deletedCount: 0 };

  let query = client
    .from("deals")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .in("id", cleanIds);
  if (brokerId) query = query.eq("broker_id", brokerId);
  const { error, data: removedRows } = await query.select("id");
  if (error) return { error: error.message, deletedCount: 0 };

  revalidateListings();
  return { error: null, deletedCount: removedRows?.length ?? 0 };
}

// Un-does a removal — brings a listing back to "published" and clears
// removed_at. Scoped to the caller's own rows and only fires on rows that
// are actually currently removed, so it can't be used to resurrect
// something else or double-publish a draft.
export async function restoreDealAction(id: string, asAdmin = false): Promise<{ error: string | null }> {
  const { client, brokerId } = await dealEditor(asAdmin);

  if (!id) return { error: "Missing deal id." };

  let query = client
    .from("deals")
    .update({ status: "published", removed_at: null })
    .eq("id", id)
    .eq("status", "removed");
  if (brokerId) query = query.eq("broker_id", brokerId);
  const { error } = await query;
  if (error) return { error: carsActError(error.message) };

  revalidateListings();
  return { error: null };
}

// Broker fills in or fixes a draft's details before confirming it — e.g.
// adding a trim/color the parser missed, or correcting something it got
// wrong. Same fields and validation as the manual "add a car" form, but
// updates the existing draft row in place instead of inserting a new one.
// Status stays "draft" here; confirmDraftsAction is what actually publishes.
export async function updateDraftDealAction(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing deal id." };

  const year = Number(formData.get("year"));
  const { make, model, trim } = normalizeModelTrim({
    make: String(formData.get("make") || "").trim(),
    model: String(formData.get("model") || "").trim(),
    trim: String(formData.get("trim") || "").trim() || null,
  });
  const bodyStyle = String(formData.get("bodyStyle") || "").trim() || null;
  const fuel = String(formData.get("fuel") || "").trim() || null;
  const exterior = String(formData.get("exterior") || "").trim() || null;
  const interior = String(formData.get("interior") || "").trim() || null;
  const dealType = String(formData.get("dealType") || "Lease").trim();
  const onePay = formData.get("onePay") === "on";
  const payment = onePay ? 0 : Number(formData.get("payment"));
  const dueAtSigning = Number(formData.get("dueAtSigning"));
  const dueAtSigningTaxRateRaw = formData.get("dueAtSigningTaxRate");
  const dueAtSigningTaxRate = dueAtSigningTaxRateRaw ? Number(dueAtSigningTaxRateRaw) : null;
  const paymentTaxRateRaw = formData.get("paymentTaxRate");
  const paymentTaxRate = paymentTaxRateRaw ? Number(paymentTaxRateRaw) : null;
  const brokerFeeRaw = formData.get("brokerFee");
  const brokerFee = brokerFeeRaw ? Number(brokerFeeRaw) : null;
  const msd = parseMsdFields(formData);
  if ("error" in msd) return { error: msd.error };
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const { msrp, maskMsrp, msrpMaskedLabel } = parseMsrpInput(String(formData.get("msrp") || ""));
  const sellingPriceRaw = formData.get("sellingPrice");
  const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;
  const notes = String(formData.get("notes") || "").trim();
  const condition = String(formData.get("condition") || "").trim() || null;
  const incentives = parseIncentivesField(formData);
  const mileageOptions =
    dealType === "Lease" ? sanitizeMileageOptions(parseJsonField(formData, "mileageOptions"), milesPerYear) : [];
  const leaseOptions =
    dealType === "Lease" && !onePay
      ? sanitizeLeaseOptions(parseJsonField(formData, "leaseOptions"), { term, milesPerYear })
      : [];
  const location = parseLocationFields(formData);
  if ("error" in location) return { error: location.error };
  const images = String(formData.get("images") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!year || !make || !model) {
    return { error: "Please fill in the year, make, and model." };
  }
  if (!msrp) {
    return { error: "Please enter the MSRP." };
  }
  if (!dueAtSigning || !term) {
    return { error: "Please fill in the deal terms (due at signing and term)." };
  }
  if (!onePay && !payment) {
    return { error: "Please enter a monthly payment, or mark this as a one-pay lease." };
  }
  if (dealType === "Lease" && !milesPerYear) {
    return { error: "Please enter the miles per year for this lease." };
  }
  for (const url of images) {
    try {
      new URL(url);
    } catch {
      return { error: `"${url}" doesn't look like a valid photo URL.` };
    }
  }

  let finalImages = images;
  const photoAutoSourced = images.length === 0;
  if (finalImages.length === 0) {
    const photo = await fetchCarsxePhoto({ year, make, model, trim: trim ?? undefined, color: exterior });
    if (photo) finalImages = [photo];
  }

  const { error } = await supabase
    .from("deals")
    .update({
      year,
      make,
      model,
      trim,
      body_style: bodyStyle,
      fuel,
      exterior,
      interior,
      deal_type: dealType,
      msrp,
      selling_price: sellingPrice,
      payment,
      due_at_signing: dueAtSigning,
      due_at_signing_tax_rate: dueAtSigningTaxRate,
      payment_tax_rate: paymentTaxRate,
      mask_msrp: maskMsrp,
      msrp_masked_label: msrpMaskedLabel,
      broker_fee: brokerFee,
      msd_count: msd.msdCount,
      msd_total: msd.msdTotal,
      term,
      miles_per_year: milesPerYear,
      apr,
      notes,
      condition,
      incentives,
      mileage_options: mileageOptions,
      lease_options: leaseOptions,
      city: location.city,
      state: location.state,
      delivery: location.delivery,
      photo_auto_sourced: photoAutoSourced,
      images: finalImages,
      one_pay: onePay,
    })
    .eq("id", id)
    .eq("broker_id", user.id)
    .eq("status", "draft");

  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  return { error: null };
}

// Broker discards a single staged draft directly from the confirmation
// list (a quicker path than unchecking it and hitting the bulk "Confirm &
// publish" button just to get rid of one bad row). Drafts here were never
// published, so this hard-deletes rather than soft-deleting — matching how
// unchecked drafts are already discarded in confirmDraftsAction below. The
// `status = draft` guard keeps this scoped to this exact list even if a
// stale id somehow got reused.
export async function deleteDraftAction(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  if (!id) return { error: "Missing deal id." };

  const { error } = await supabase
    .from("deals")
    .delete()
    .eq("id", id)
    .eq("broker_id", user.id)
    .eq("status", "draft");
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  return { error: null };
}

// Broker confirms which staged drafts (added by admin from a submitted
// link/sheet/file) should actually go live. Checked ids get published,
// unchecked ones are discarded.
export async function confirmDraftsAction(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const allDraftIds = formData.getAll("draftId").map(String);
  const keepIds = formData.getAll("keep").map(String);
  const discardIds = allDraftIds.filter((id) => !keepIds.includes(id));

  // Dealership drafts without a total price can't go live yet (California's
  // CARS Act) — they stay in the queue and the broker is told why.
  let blocked = 0;
  if (keepIds.length > 0) {
    const { data: kept } = await supabase
      .from("deals")
      .select("id, seller_type, selling_price")
      .in("id", keepIds)
      .eq("broker_id", user.id)
      .returns<{ id: string; seller_type: string; selling_price: number | null }[]>();
    const ready = (kept ?? []).filter((d) => !needsTotalPrice(d.seller_type) || d.selling_price != null).map((d) => d.id);
    blocked = (kept ?? []).length - ready.length;
    if (ready.length > 0) {
      const { error } = await supabase
        .from("deals")
        // The "Just listed" badge and Newest sort count from when the car
        // goes live, not from when the draft was pulled in.
        .update({ status: "published", date_posted: new Date().toISOString().slice(0, 10) })
        .in("id", ready)
        .eq("broker_id", user.id);
      if (error) return { error: carsActError(error.message) };
      after(() => alertAdminsFirstListing(user.id));
    }
  }

  if (discardIds.length > 0) {
    const { error } = await supabase
      .from("deals")
      .delete()
      .in("id", discardIds)
      .eq("broker_id", user.id);
    if (error) return { error: error.message };
  }

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
  if (blocked > 0) {
    return {
      error: `${blocked} car${blocked === 1 ? " needs" : "s need"} a total price before going live — California's CARS Act requires it on dealership listings. Use Edit to add it, then confirm again.`,
    };
  }
  return { error: null };
}

// Multiple security deposits (supabase/migrations/0020_msds.sql): how many
// the advertised payment assumes, and their refundable total. Both blank =
// no MSDs; a total without a count doesn't mean anything, so it's refused.
function parseMsdFields(
  formData: FormData
): { msdCount: number | null; msdTotal: number | null } | { error: string } {
  const countRaw = String(formData.get("msdCount") ?? "").trim();
  const totalRaw = String(formData.get("msdTotal") ?? "").replace(/[$,\s]/g, "");
  const msdCount = countRaw ? Number(countRaw) : null;
  const msdTotal = totalRaw ? Number(totalRaw) : null;
  if (msdCount != null && (!Number.isInteger(msdCount) || msdCount < 1 || msdCount > 20)) {
    return { error: "Number of MSDs should be a whole number from 1 to 20." };
  }
  if (msdTotal != null && (!Number.isFinite(msdTotal) || msdTotal < 0 || msdTotal > 250000)) {
    return { error: "Enter the MSD total as a dollar amount." };
  }
  if (msdTotal != null && msdCount == null) {
    return { error: "Add how many MSDs the payment assumes, or clear the MSD total." };
  }
  return { msdCount, msdTotal };
}
