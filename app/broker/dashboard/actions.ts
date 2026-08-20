"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify, parseMsrpInput } from "@/lib/deal-utils";
import { fetchCarsxePhoto } from "@/lib/carsxe";
import { parseInventoryBuffer, parseInventoryCsv, type ParsedDeal } from "@/lib/parse-inventory";
import {
  parseFreeTextWithAI,
  parseImageWithAI,
  type SupportedImageType,
} from "@/lib/ai-parse-inventory";
import { suggestIncentives, type SuggestedIncentive } from "@/lib/ai-incentives";
import { extractGoogleSheetId, fetchGoogleSheetCsv } from "@/lib/google-sheet";
import { stageParsedDeals, type BrokerProfile } from "@/lib/deal-staging";

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

// Called directly from the client (not a <form> submit) when a broker hits
// "Suggest with AI" on a car's incentives list. Returns starting suggestions
// only — nothing is saved here, the broker edits/removes before the
// surrounding form is actually submitted.
export async function suggestIncentivesAction(input: {
  year: number;
  make: string;
  model: string;
  trim?: string;
  state?: string;
  zip?: string;
}): Promise<{ incentives: SuggestedIncentive[]; error: string | null }> {
  if (!input.year || !input.make.trim() || !input.model.trim()) {
    return { incentives: [], error: "Fill in year, make, and model first." };
  }
  // No longer gated on ANTHROPIC_API_KEY alone — MarketCheck (real incentive
  // data) is tried first and doesn't need it. suggestIncentives() falls back
  // to Claude only when MarketCheck has nothing, and that fallback quietly
  // returns [] if ANTHROPIC_API_KEY isn't configured either.
  const incentives = await suggestIncentives(input);
  return { incentives, error: null };
}

// Called from the "Re-pull photo" button in MyListings when a listing's
// auto-sourced photo doesn't show the whole car (a close-up, interior, or
// engine-bay shot). Just looks up a fresh CarsXE photo and hands the URL
// back — it doesn't touch the deal row itself, the broker still reviews it
// and hits Save like any other edit, same as pasting in a URL by hand.
export async function repullPhotoAction(input: {
  year: number;
  make: string;
  model: string;
  trim?: string;
}): Promise<{ imageUrl: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  if (!input.year || !input.make.trim() || !input.model.trim()) {
    return { imageUrl: null, error: "Fill in year, make, and model first." };
  }

  const imageUrl = await fetchCarsxePhoto({
    year: input.year,
    make: input.make,
    model: input.model,
    trim: input.trim,
  });

  if (!imageUrl) {
    return { imageUrl: null, error: "Couldn't find a photo for this exact year/make/model/trim." };
  }
  return { imageUrl, error: null };
}

// Parses the hidden `incentives` field (JSON string written by
// IncentivesEditor) that every deal-editing form submits, tolerating a
// missing/invalid value rather than throwing.
function parseIncentivesField(
  formData: FormData
): { name: string; amount: number; includedInPrice: boolean }[] {
  const raw = String(formData.get("incentives") || "[]");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is { name: string; amount: number; includedInPrice?: boolean } =>
          i && typeof i.name === "string" && i.name.trim().length > 0 && typeof i.amount === "number" && i.amount > 0
      )
      .map((i) => ({ name: i.name.trim(), amount: i.amount, includedInPrice: i.includedInPrice === true }));
  } catch {
    return [];
  }
}

// Link / Google Sheet / Excel file. For Excel files and Google Sheets, we
// try to automatically pull individual cars out of the file into draft
// listings the broker can review and confirm — see lib/parse-inventory.ts.
// For a plain forum/website link (or if parsing comes up empty), the broker
// gets the structured "add a car" form to fill in themselves instead — see
// createManualDealAction below. Either way, nothing needs your approval.
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
    .select("business_name, seller_type, dealership_name, contact_phone, city, state")
    .eq("id", user.id)
    .single<BrokerProfile>();

  const sourceType = String(formData.get("sourceType") || "link");
  const notes = String(formData.get("notes") || "").trim() || null;
  let sourceUrl = "";
  let parsedDeals: ParsedDeal[] = [];
  let skippedCount = 0;
  let skipReasons: string[] = [];

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
        skipReasons = result.skipped.map((s) => s.reason);
        logSkippedRows("excel_file", result.skipped);
        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We opened the file but couldn't find any rows on the first sheet — check the file and try again, or add cars manually below.",
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
  } else if (sourceType === "google_sheet" || sourceType === "link") {
    sourceUrl = String(formData.get("sourceUrl") || "").trim();
    if (!sourceUrl) return { error: "Please enter a link." };
    try {
      // eslint-disable-next-line no-new
      new URL(sourceUrl);
    } catch {
      return { error: "That doesn't look like a valid URL." };
    }

    if (sourceType === "google_sheet") {
      if (!broker) {
        return { error: "Couldn't find your broker profile — try signing in again." };
      }

      const fetched = await fetchGoogleSheetCsv(sourceUrl);
      if (!fetched.ok) {
        return { error: fetched.error };
      }

      try {
        const result = await parseInventoryCsv(fetched.csvText, broker.state);
        parsedDeals = result.parsed;
        skippedCount = result.skipped.length;
        skipReasons = result.skipped.map((s) => s.reason);
        logSkippedRows("google_sheet", result.skipped);

        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We opened the sheet but couldn't find any rows on the first tab. Make sure your inventory is on the first sheet tab, or add cars manually below.",
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
  // app/api/cron/sync-sheets. This initial batch still lands as drafts for
  // review either way; only rows the recurring job finds later honor the
  // auto-publish choice.
  let sheetSyncId: string | null = null;
  if (sourceType === "google_sheet" && formData.get("keepSynced") === "on") {
    const autoPublish = formData.get("autoPublish") === "on";
    const { data: sync, error: syncError } = await supabase
      .from("sheet_syncs")
      .insert({ broker_id: user.id, sheet_url: sourceUrl, auto_publish: autoPublish })
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
    const staging = await stageParsedDeals(supabase, user.id, user.email, broker, inserted.id, parsedDeals, {
      sheetSyncId,
    });
    stageFailed = staging.failed;
    stageLastError = staging.lastError;
  }

  revalidatePath("/broker/dashboard");

  // Every parsed car failed to save as a draft — this is a real backend
  // problem (e.g. a database migration that hasn't been run), not "no cars
  // found," so it needs to say so rather than quietly claiming success.
  if (parsedDeals.length > 0 && stageFailed === parsedDeals.length) {
    return {
      error: `We read ${parsedDeals.length} car${parsedDeals.length === 1 ? "" : "s"} but couldn't save ${
        parsedDeals.length === 1 ? "it" : "them"
      } as drafts (${stageLastError ?? "unknown error"}). This looks like a backend issue — let Robert know so he can check it, or add the car(s) manually below in the meantime.`,
    };
  }

  return {
    error: null,
    success: true,
    submissionId: inserted?.id,
    parsedCount: parsedDeals.length - stageFailed,
    skippedCount: skippedCount + stageFailed,
    skipReasons,
    sheetSynced: sheetSyncId !== null,
  };
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

export async function toggleSheetSyncAutoPublishAction(
  id: string,
  autoPublish: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");
  if (!id) return { error: "Missing sync id." };

  const { error } = await supabase
    .from("sheet_syncs")
    .update({ auto_publish: autoPublish })
    .eq("id", id)
    .eq("broker_id", user.id);
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
    .select("business_name, seller_type, dealership_name, contact_phone, city, state")
    .eq("id", user.id)
    .single<{
      business_name: string;
      seller_type: string;
      dealership_name: string | null;
      contact_phone: string;
      city: string;
      state: string;
    }>();
  if (!broker) return { error: "Couldn't find your broker profile — try signing in again." };

  const year = Number(formData.get("year"));
  const make = String(formData.get("make") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const trim = String(formData.get("trim") || "").trim() || null;
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
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      return { error: `"${url}" doesn't look like a valid photo URL.` };
    }
  }

  const photoAutoSourced = images.length === 0;
  if (images.length === 0) {
    const photo = await fetchCarsxePhoto({ year, make, model, trim: trim ?? undefined });
    if (photo) images = [photo];
  }

  const slug = slugify([year, make, model, trim ?? "", broker.state]);

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
    term,
    miles_per_year: milesPerYear,
    apr,
    seller_type: broker.seller_type,
    seller_name: broker.business_name,
    seller_dealership: broker.dealership_name,
    seller_phone: broker.contact_phone,
    seller_email: user.email ?? "",
    city: broker.city,
    state: broker.state,
    verified: true,
    condition,
    incentives,
    photo_auto_sourced: photoAutoSourced,
    in_stock: true,
    popularity: 50,
    notes,
    images,
    one_pay: onePay,
    status: "published",
  });
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
  return { error: null, success: true, submissionId: submissionId ?? undefined };
}

// -----------------------------------------------------------------------------
// Managing already-published (or draft) listings
// -----------------------------------------------------------------------------

export async function updateDealAction(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing deal id." };

  const year = Number(formData.get("year"));
  const make = String(formData.get("make") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const trim = String(formData.get("trim") || "").trim() || null;
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
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      return { error: `"${url}" doesn't look like a valid photo URL.` };
    }
  }

  let finalImages = images;
  const photoAutoSourced = images.length === 0;
  if (finalImages.length === 0) {
    const photo = await fetchCarsxePhoto({ year, make, model, trim: trim ?? undefined });
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
      term,
      miles_per_year: milesPerYear,
      apr,
      in_stock: inStock,
      notes,
      condition,
      incentives,
      images: finalImages,
      photo_auto_sourced: photoAutoSourced,
      one_pay: onePay,
    })
    .eq("id", id)
    .eq("broker_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/broker/dashboard");
  revalidatePath("/");
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing deal id." };

  const { error } = await supabase
    .from("deals")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("broker_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
  return { error: null };
}

// Bulk version for the "select multiple rows, delete" flow in the spreadsheet
// view of the broker's listings. Scoped to the caller's own rows the same
// way the single-delete action is, so a broker can never delete someone
// else's listing even if IDs were tampered with client-side.
export async function deleteDealsAction(ids: string[]): Promise<{ error: string | null; deletedCount: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const cleanIds = ids.filter(Boolean);
  if (cleanIds.length === 0) return { error: "No listings selected.", deletedCount: 0 };

  const { error, data: removedRows } = await supabase
    .from("deals")
    .update({ status: "removed", removed_at: new Date().toISOString() })
    .in("id", cleanIds)
    .eq("broker_id", user.id)
    .select("id");
  if (error) return { error: error.message, deletedCount: 0 };

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
  return { error: null, deletedCount: removedRows?.length ?? 0 };
}

// Un-does a removal — brings a listing back to "published" and clears
// removed_at. Scoped to the caller's own rows and only fires on rows that
// are actually currently removed, so it can't be used to resurrect
// something else or double-publish a draft.
export async function restoreDealAction(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  if (!id) return { error: "Missing deal id." };

  const { error } = await supabase
    .from("deals")
    .update({ status: "published", removed_at: null })
    .eq("id", id)
    .eq("broker_id", user.id)
    .eq("status", "removed");
  if (error) return { error: error.message };

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
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
  const make = String(formData.get("make") || "").trim();
  const model = String(formData.get("model") || "").trim();
  const trim = String(formData.get("trim") || "").trim() || null;
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
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      return { error: `"${url}" doesn't look like a valid photo URL.` };
    }
  }

  let finalImages = images;
  const photoAutoSourced = images.length === 0;
  if (finalImages.length === 0) {
    const photo = await fetchCarsxePhoto({ year, make, model, trim: trim ?? undefined });
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
      term,
      miles_per_year: milesPerYear,
      apr,
      notes,
      condition,
      incentives,
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

  if (keepIds.length > 0) {
    const { error } = await supabase
      .from("deals")
      .update({ status: "published" })
      .in("id", keepIds)
      .eq("broker_id", user.id);
    if (error) return { error: error.message };
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
  return { error: null };
}
