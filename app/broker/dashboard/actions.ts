"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/deal-utils";
import { fetchCarsxePhoto } from "@/lib/carsxe";

export type SubmissionState = {
  error: string | null;
  success?: boolean;
  submissionId?: string;
};

// Link / Google Sheet / Excel file — logged for your own reference, but
// doesn't publish anything by itself. Right after submitting, the broker
// gets the same structured "add a car" form to fill in themselves for each
// car from that source, which publishes immediately (see
// createManualDealAction below) — no admin step required.
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

  revalidatePath("/broker/dashboard");
  return { error: null, success: true, submissionId: inserted?.id };
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
    .select("business_name, seller_type, contact_phone, city, state")
    .eq("id", user.id)
    .single<{
      business_name: string;
      seller_type: string;
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
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const msrp = Number(formData.get("msrp"));
  const sellingPriceRaw = formData.get("sellingPrice");
  const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;
  const notes = String(formData.get("notes") || "").trim();
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
    term,
    miles_per_year: milesPerYear,
    apr,
    seller_type: broker.seller_type,
    seller_name: broker.business_name,
    seller_phone: broker.contact_phone,
    seller_email: user.email ?? "",
    city: broker.city,
    state: broker.state,
    verified: true,
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

  const payment = Number(formData.get("payment"));
  const dueAtSigning = Number(formData.get("dueAtSigning"));
  const inStock = formData.get("inStock") === "on";
  const notes = String(formData.get("notes") || "").trim();

  const { error } = await supabase
    .from("deals")
    .update({
      payment,
      due_at_signing: dueAtSigning,
      in_stock: inStock,
      notes,
    })
    .eq("id", id)
    .eq("broker_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/broker/dashboard");
  revalidatePath("/");
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
