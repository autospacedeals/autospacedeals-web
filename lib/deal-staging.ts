// Shared "turn a parsed row into a deals row" logic — used by the broker
// dashboard's upload flow (app/broker/dashboard/actions.ts) and the
// recurring Google Sheet sync job (lib/sheet-sync.ts), so both insert deals
// the exact same way.
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyVehicles } from "@/lib/vehicle-classify";
import { slugify } from "@/lib/deal-utils";
import { fetchCarsxePhoto } from "@/lib/carsxe";
import { computeMatchSignature, type ParsedDeal } from "@/lib/parse-inventory";
import { mapLimit } from "@/lib/concurrency";
import { applyDealExtras, getDealExtras } from "@/lib/deal-disclaimers";

export interface BrokerProfile {
  business_name: string;
  seller_type: string;
  dealership_name: string | null;
  city: string;
  state: string;
}

export interface StageOptions {
  // "draft" (default) lands in the broker's confirmation queue, same as
  // every other AI-parsed submission. "published" is only used for
  // sync-detected new rows when the broker has opted into auto-publish for
  // that sheet — see lib/sheet-sync.ts.
  status?: "draft" | "published";
  // Set when these deals came from a synced Google Sheet, so future sync
  // runs can find them again by signature and tell "still there" apart from
  // "removed."
  sheetSyncId?: string | null;
}

// Turns each successfully-parsed row into a deal owned by the broker. By
// default it's staged as a draft (status: "draft") tied back to the
// submission for reference — drafts show up in the broker's "ready for your
// confirmation" checklist (see DraftConfirmList / confirmDraftsAction).
export async function stageParsedDeals(
  supabase: SupabaseClient,
  userId: string,
  broker: BrokerProfile,
  submissionId: string | null,
  deals: ParsedDeal[],
  options: StageOptions = {}
): Promise<{ staged: number; failed: number; lastError: string | null }> {
  const status = options.status ?? "draft";
  const sheetSyncId = options.sheetSyncId ?? null;

  let staged = 0;
  let failed = 0;
  let lastError: string | null = null;

  // Uploads only carry year/make/model/trim — look up fuel type and body
  // style for the whole batch in one go so they're searchable/filterable.
  const [classes, extras] = await Promise.all([classifyVehicles(deals), getDealExtras(userId)]);

  // Several at a time — a 200-car sheet would take minutes one by one (each
  // car looks up a photo).
  await mapLimit(deals, 8, async (d, i) => {
    let images: string[] = [];
    const photo = await fetchCarsxePhoto({
      year: d.year,
      make: d.make,
      model: d.model,
      trim: d.trim ?? undefined,
      color: d.exterior,
    });
    if (photo) images = [photo];

    const slug = slugify([d.year, d.make, d.model, d.trim ?? "", broker.state]);

    const { error } = await supabase.from("deals").insert({
      slug,
      broker_id: userId,
      submission_id: submissionId,
      sheet_sync_id: sheetSyncId,
      sheet_tab: sheetSyncId ? (d.sheetTab ?? null) : null,
      match_signature: sheetSyncId ? computeMatchSignature(d) : null,
      year: d.year,
      make: d.make,
      model: d.model,
      trim: d.trim,
      body_style: classes[i]?.bodyStyle ?? null,
      fuel: classes[i]?.fuel ?? null,
      exterior: d.exterior,
      interior: d.interior,
      deal_type: "Lease",
      msrp: d.msrp,
      selling_price: null,
      payment: d.payment,
      due_at_signing: d.dueAtSigning,
      broker_fee: d.brokerFee,
      msd_count: d.msdCount ?? null,
      msd_total: d.msdTotal ?? null,
      term: d.term,
      miles_per_year: d.milesPerYear,
      apr: null,
      seller_type: broker.seller_type,
      seller_name: broker.business_name,
      seller_dealership: broker.dealership_name,
      city: d.city ?? broker.city,
      state: d.state ?? broker.state,
      delivery: d.delivery ?? null,
      verified: true,
      condition: null,
      mileage_options: d.mileageOptions ?? [],
      photo_auto_sourced: true,
      in_stock: true,
      popularity: 50,
      // notes + incentives, with the broker's standing extras
      ...applyDealExtras(d, extras),
      images,
      one_pay: d.onePay,
      status,
    });

    if (error) {
      failed++;
      lastError = error.message;
      console.error("Failed to save a parsed deal:", error.message, {
        year: d.year,
        make: d.make,
        model: d.model,
      });
    } else {
      staged++;
    }
  });

  return { staged, failed, lastError };
}
