"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/deal-utils";
import { fetchCarsxePhoto } from "@/lib/carsxe";
import { parseInventoryBuffer, parseInventoryCsv, type ParsedDeal } from "@/lib/parse-inventory";
import {
  parseFreeTextWithAI,
  parseImageWithAI,
  type SupportedImageType,
} from "@/lib/ai-parse-inventory";
import { suggestIncentives, type SuggestedIncentive } from "@/lib/ai-incentives";

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
};

interface BrokerProfile {
  business_name: string;
  seller_type: string;
  dealership_name: string | null;
  contact_phone: string;
  city: string;
  state: string;
}

// Turns each successfully-parsed row into a draft deal (status: "draft")
// owned by the broker, tied back to the submission for reference. Drafts
// show up in the broker's "ready for your confirmation" checklist — see
// DraftConfirmList / confirmDraftsAction.
async function stageParsedDeals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userEmail: string | undefined,
  broker: BrokerProfile,
  submissionId: string,
  deals: ParsedDeal[]
): Promise<{ staged: number; failed: number; lastError: string | null }> {
  let staged = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const d of deals) {
    let images: string[] = [];
    const photo = await fetchCarsxePhoto({
      year: d.year,
      make: d.make,
      model: d.model,
      trim: d.trim ?? undefined,
    });
    if (photo) images = [photo];

    const slug = slugify([d.year, d.make, d.model, d.trim ?? "", broker.state]);

    const { error } = await supabase.from("deals").insert({
      slug,
      broker_id: userId,
      submission_id: submissionId,
      year: d.year,
      make: d.make,
      model: d.model,
      trim: d.trim,
      body_style: null,
      fuel: null,
      exterior: d.exterior,
      interior: d.interior,
      deal_type: "Lease",
      msrp: d.msrp,
      selling_price: null,
      payment: d.payment,
      due_at_signing: d.dueAtSigning,
      term: d.term,
      miles_per_year: d.milesPerYear,
      apr: null,
      seller_type: broker.seller_type,
      seller_name: broker.business_name,
      seller_dealership: broker.dealership_name,
      seller_phone: broker.contact_phone,
      seller_email: userEmail ?? "",
      city: broker.city,
      state: d.state ?? broker.state,
      verified: true,
      condition: null,
      incentives: [],
      photo_auto_sourced: true,
      in_stock: true,
      popularity: 50,
      notes: d.notes,
      images,
      one_pay: false,
      status: "draft",
    });

    if (error) {
      failed++;
      lastError = error.message;
      console.error("Failed to save a parsed deal as a draft:", error.message, {
        year: d.year,
        make: d.make,
        model: d.model,
      });
    } else {
      staged++;
    }
  }

  return { staged, failed, lastError };
}

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
}): Promise<{ incentives: SuggestedIncentive[]; error: string | null }> {
  if (!input.year || !input.make.trim() || !input.model.trim()) {
    return { incentives: [], error: "Fill in year, make, and model first." };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { incentives: [], error: "AI suggestions aren't configured yet — add incentives manually." };
  }
  const incentives = await suggestIncentives(input);
  return { incentives, error: null };
}

// Parses the hidden `incentives` field (JSON string written by
// IncentivesEditor) that every deal-editing form submits, tolerating a
// missing/invalid value rather than throwing.
function parseIncentivesField(formData: FormData): { name: string; amount: number }[] {
  const raw = String(formData.get("incentives") || "[]");
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is { name: string; amount: number } =>
          i && typeof i.name === "string" && i.name.trim().length > 0 && typeof i.amount === "number" && i.amount > 0
      )
      .map((i) => ({ name: i.name.trim(), amount: i.amount }));
  } catch {
    return [];
  }
}

function extractGoogleSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
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
        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We opened the file but couldn't find any rows on the first sheet — check the file and try again, or add cars manually below.",
          };
        }
      } catch (err) {
        console.error("Failed to parse uploaded inventory file:", err);
        return {
          error: "Couldn't read that file — make sure it's a valid .xlsx, .xls, or .csv, or add cars manually below.",
        };
      }
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

    if (sourceType === "google_sheet") {
      if (!broker) {
        return { error: "Couldn't find your broker profile — try signing in again." };
      }

      const sheetId = extractGoogleSheetId(sourceUrl);
      if (!sheetId) {
        return {
          error:
            "That doesn't look like a Google Sheets link — copy the URL from your browser's address bar while viewing the sheet.",
        };
      }

      try {
        const res = await fetch(
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
          {
            // Google's export endpoint sometimes behaves differently (or
            // blocks) requests without a browser-like User-Agent.
            headers: { "User-Agent": "Mozilla/5.0 (compatible; AutoSpaceDealsBot/1.0)" },
          }
        );

        if (!res.ok) {
          return {
            error: `Couldn't open that Google Sheet (error ${res.status}). Make sure sharing is set to "Anyone with the link can view" and try again.`,
          };
        }

        const csvText = await res.text();
        // A private/unshared sheet's export URL redirects to a Google
        // sign-in or "request access" HTML page instead of CSV — catch that
        // instead of silently trying (and failing) to parse it as data.
        const looksLikeHtml = /^\s*<(!doctype|html)/i.test(csvText);
        if (looksLikeHtml) {
          return {
            error:
              'That Google Sheet isn\'t publicly viewable yet. In Google Sheets, click "Share" → set to "Anyone with the link" → Viewer, then try again.',
          };
        }

        const result = await parseInventoryCsv(csvText, broker.state);
        parsedDeals = result.parsed;
        skippedCount = result.skipped.length;

        if (parsedDeals.length === 0 && skippedCount === 0) {
          return {
            error:
              "We opened the sheet but couldn't find any rows on the first tab. Make sure your inventory is on the first sheet tab, or add cars manually below.",
          };
        }
      } catch (err) {
        console.error("Failed to fetch/parse Google Sheet:", err);
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

    const path = `${user.id}/${Date.now()}-${file.name}`;
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

  let stageFailed = 0;
  let stageLastError: string | null = null;
  if (broker && parsedDeals.length > 0 && inserted) {
    const staging = await stageParsedDeals(supabase, user.id, user.email, broker, inserted.id, parsedDeals);
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
  };
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
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const msrp = Number(formData.get("msrp"));
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
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const msrp = Number(formData.get("msrp"));
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

export async function deleteDealAction(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing deal id." };

  const { error } = await supabase.from("deals").delete().eq("id", id).eq("broker_id", user.id);
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

  const { error, data: deletedRows } = await supabase
    .from("deals")
    .delete()
    .in("id", cleanIds)
    .eq("broker_id", user.id)
    .select("id");
  if (error) return { error: error.message, deletedCount: 0 };

  revalidatePath("/broker/dashboard");
  revalidatePath("/");
  return { error: null, deletedCount: deletedRows?.length ?? 0 };
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
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const msrp = Number(formData.get("msrp"));
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
