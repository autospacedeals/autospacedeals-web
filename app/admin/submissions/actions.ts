"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { slugify } from "@/lib/deal-utils";

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
    .select("business_name, seller_type, contact_phone, city, state")
    .eq("id", brokerId)
    .single<{
      business_name: string;
      seller_type: string;
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
  const trim = String(formData.get("trim") || "").trim();
  const bodyStyle = String(formData.get("bodyStyle") || "").trim();
  const fuel = String(formData.get("fuel") || "").trim();
  const exterior = String(formData.get("exterior") || "").trim();
  const interior = String(formData.get("interior") || "").trim();
  const dealType = String(formData.get("dealType") || "Lease").trim();
  const onePay = formData.get("onePay") === "on";
  const payment = onePay ? 0 : Number(formData.get("payment"));
  const dueAtSigning = Number(formData.get("dueAtSigning"));
  const term = Number(formData.get("term"));
  const milesPerYearRaw = formData.get("milesPerYear");
  const milesPerYear = milesPerYearRaw ? Number(milesPerYearRaw) : null;
  const aprRaw = formData.get("apr");
  const apr = aprRaw ? Number(aprRaw) : null;
  const msrpRaw = formData.get("msrp");
  const msrp = msrpRaw ? Number(msrpRaw) : null;
  const sellingPriceRaw = formData.get("sellingPrice");
  const sellingPrice = sellingPriceRaw ? Number(sellingPriceRaw) : null;
  const notes = String(formData.get("notes") || "").trim();
  const sourceUrlRaw = String(formData.get("sourceUrl") || "").trim();
  const images = String(formData.get("images") || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!year || !make || !model || !trim || !bodyStyle || !fuel || !exterior || !interior) {
    return { error: "Please fill in all vehicle details." };
  }
  if (!dueAtSigning || !term) {
    return { error: "Please fill in the deal terms." };
  }
  if (!onePay && !payment) {
    return { error: "Please enter a monthly payment, or mark this as a one-pay lease." };
  }
  if (images.length === 0) {
    return { error: "Please add at least one photo URL." };
  }

  const slug = slugify([year, make, model, trim, broker.state]);

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
    seller_phone: broker.contact_phone,
    city: broker.city,
    state: broker.state,
    seller_email: brokerEmail,
    verified: true,
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
