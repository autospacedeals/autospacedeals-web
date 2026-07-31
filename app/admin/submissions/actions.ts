"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { slugify } from "@/lib/deal-utils";
import { fetchCarsxePhoto } from "@/lib/carsxe";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    redirect("/broker/login");
  }
}

export async function reviewSubmissionAction(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const adminNotes = String(formData.get("adminNotes") || "").trim() || null;

  if (!id || (status !== "approved" && status !== "rejected")) {
    throw new Error("Invalid review submission.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("submissions")
    .update({ status, admin_notes: adminNotes, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/submissions");
}

export type StageDealState = { error: string | null; success?: boolean };

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

// Admin reads a broker's submitted link/sheet/file and stages an individual
// car from it as a "draft" deal, owned by that broker. It shows up in their
// dashboard for them to confirm (or uncheck) before it actually goes live —
// this is the human-review step for anything that wasn't typed in directly
// by the broker themselves.
export async function stageDealDraftAction(
  _prevState: StageDealState,
  formData: FormData
): Promise<StageDealState> {
  await assertAdmin();

  const submissionId = String(formData.get("submissionId") || "");
  const brokerId = String(formData.get("brokerId") || "");
  if (!submissionId || !brokerId) return { error: "Missing submission or broker id." };

  const admin = createAdminClient();

  const { data: broker } = await admin
    .from("brokers")
    .select("business_name, seller_type, dealership_name, contact_phone, city, state")
    .eq("id", brokerId)
    .single<{
      business_name: string;
      seller_type: string;
      dealership_name: string | null;
      contact_phone: string;
      city: string;
      state: string;
    }>();
  if (!broker) return { error: "Couldn't find that broker's profile." };

  const { data: authUser } = await admin.auth.admin.getUserById(brokerId);
  const brokerEmail = authUser?.user?.email ?? "";

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
  const condition = String(formData.get("condition") || "").trim() || null;
  const incentives = parseIncentivesField(formData);
  const sourceUrlRaw = String(formData.get("sourceUrl") || "").trim();
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
    return { error: "Please fill in the deal terms." };
  }
  if (!onePay && !payment) {
    return { error: "Please enter a monthly payment, or mark this as a one-pay lease." };
  }
  if (dealType === "Lease" && !milesPerYear) {
    return { error: "Please enter the miles per year for this lease." };
  }

  const photoAutoSourced = images.length === 0;
  if (images.length === 0) {
    const photo = await fetchCarsxePhoto({ year, make, model, trim: trim ?? undefined });
    if (photo) images = [photo];
  }

  const slug = slugify([year, make, model, trim ?? "", broker.state]);

  const { error } = await admin.from("deals").insert({
    slug,
    broker_id: brokerId,
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
    seller_dealership: broker.dealership_name,
    seller_phone: broker.contact_phone,
    city: broker.city,
    state: broker.state,
    seller_email: brokerEmail,
    verified: true,
    condition,
    incentives,
    photo_auto_sourced: photoAutoSourced,
    in_stock: true,
    popularity: 50,
    notes,
    images,
    source_url: sourceUrlRaw || null,
    one_pay: onePay,
    status: "draft",
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/submissions");
  return { error: null, success: true };
}
