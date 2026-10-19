// Shared "turn a parsed row into a deals row" logic — used by the broker
// dashboard's upload flow (app/broker/dashboard/actions.ts) and the
// recurring Google Sheet sync job (lib/sheet-sync.ts), so both insert deals
// the exact same way.
import { needsTotalPrice } from "@/lib/cars-act";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyVehicles } from "@/lib/vehicle-classify";
import { slugify } from "@/lib/deal-utils";
import { fetchCarsxePhoto } from "@/lib/carsxe";
import { downloadImage, saveSellerPhoto } from "@/lib/photo-library";
import { frontDirection, type FrontDirection } from "@/lib/photo-view";
import { computeMatchSignature, type ParsedDeal } from "@/lib/parse-inventory";
import { mapLimit } from "@/lib/concurrency";
import { applyDealExtras, getDealExtras, ruleColumns } from "@/lib/deal-disclaimers";
import { normalizeModelTrim } from "@/lib/vehicle-names";
import { listingPaths, notifyIndexNow } from "@/lib/indexnow";

const MAX_SELLER_PHOTOS = 8;

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
  const livePaths: string[] = [];

  // Uploads only carry year/make/model/trim — look up fuel type and body
  // style for the whole batch in one go so they're searchable/filterable.
  const [classes, extras] = await Promise.all([classifyVehicles(deals), getDealExtras(userId)]);

  // One photo lookup per distinct car (a big sheet repeats the same model
  // many times), a few at a time so CarsXE doesn't start refusing them.
  const photos = new Map<string, Promise<string | null>>();
  const photoFor = (d: ParsedDeal, bodyStyle: string | null) => {
    const key = [d.year, d.make, d.model, d.trim ?? "", d.exterior ?? ""].join("|").toLowerCase();
    let photo = photos.get(key);
    if (!photo) {
      photo = fetchCarsxePhoto({ year: d.year, make: d.make, model: d.model, trim: d.trim ?? undefined, color: d.exterior, bodyStyle });
      photos.set(key, photo);
    }
    return photo;
  };

  // The seller's own photos (from their website) are used instead of a
  // stock photo; each is copied once even if several listings share it.
  const sellerPhotos = new Map<string, Promise<string | null>>();
  const sellerPhoto = (url: string) => {
    let saved = sellerPhotos.get(url);
    if (!saved) {
      saved = saveSellerPhoto(userId, url);
      sellerPhotos.set(url, saved);
    }
    return saved;
  };

  // Their photo at our stock photos' angle (front three-quarter, nose to
  // the left) leads, so their cards match the rest of the site. Checked in
  // order, stopping at the first match; each photo is checked once.
  const views = new Map<string, Promise<FrontDirection>>();
  const viewOf = (url: string) => {
    let view = views.get(url);
    if (!view) {
      view = downloadImage(url).then((image) => (image ? frontDirection(image) : "unknown"));
      views.set(url, view);
    }
    return view;
  };
  const stockAngleFirst = async (urls: string[]): Promise<string[]> => {
    if (urls.length < 2 || (await viewOf(urls[0])) === "left") return urls;
    for (let i = 1; i < urls.length; i++) {
      if ((await viewOf(urls[i])) === "left") return [urls[i], ...urls.slice(0, i), ...urls.slice(i + 1)];
    }
    return urls;
  };

  await mapLimit(deals, 4, async (d, i) => {
    let images: string[] = [];
    if (d.photoUrls?.length) {
      const saved = await mapLimit(d.photoUrls.slice(0, MAX_SELLER_PHOTOS), 4, sellerPhoto);
      images = await stockAngleFirst(saved.filter((u): u is string => !!u));
    }
    const ownPhotos = images.length > 0;
    if (!ownPhotos) {
      const photo = await photoFor(d, classes[i]?.bodyStyle ?? null);
      if (photo) images = [photo];
    }

    // One spelling per model (a row read before a spelling rule existed can
    // come back from the parse cache as written).
    const car = normalizeModelTrim({ make: d.make, model: d.model, trim: d.trim });
    const slug = slugify([d.year, car.make, car.model, car.trim ?? "", broker.state]);

    // A dealership listing can't go live without its total price
    // (California's CARS Act) — it waits as a draft for the price instead.
    const finalStatus = status === "published" && needsTotalPrice(broker.seller_type) && !d.sellingPrice ? "draft" : status;
    const { error } = await supabase.from("deals").insert({
      slug,
      broker_id: userId,
      submission_id: submissionId,
      sheet_sync_id: sheetSyncId,
      sheet_tab: sheetSyncId ? (d.sheetTab ?? null) : null,
      match_signature: sheetSyncId ? computeMatchSignature(d) : null,
      year: d.year,
      make: car.make,
      model: car.model,
      trim: car.trim,
      body_style: classes[i]?.bodyStyle ?? null,
      fuel: classes[i]?.fuel ?? null,
      exterior: d.exterior,
      interior: d.interior,
      deal_type: "Lease",
      msrp: d.msrp,
      selling_price: d.sellingPrice ?? null,
      payment: d.payment,
      due_at_signing: d.dueAtSigning,
      broker_fee: d.brokerFee,
      msd_count: d.msdCount ?? null,
      msd_total: d.msdTotal ?? null,
      msd_payment: d.msdCount ? (d.msdPayment ?? null) : null,
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
      // Unmarked cars are new, same as the add-a-car form's default.
      condition: d.condition ?? "New",
      mileage_options: d.mileageOptions ?? [],
      lease_options: d.leaseOptions ?? [],
      photo_auto_sourced: !ownPhotos,
      in_stock: true,
      popularity: 50,
      // notes + incentives, and any fee/condition/delivery the broker's
      // standing rules set
      ...applyDealExtras(d, extras),
      ...ruleColumns(d, extras),
      images,
      one_pay: d.onePay,
      status: finalStatus,
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
      if (finalStatus === "published") livePaths.push(...listingPaths({ slug, make: car.make, model: car.model }));
    }
  });
  // Search engines hear about cars that went live (lib/indexnow.ts).
  await notifyIndexNow(livePaths);

  return { staged, failed, lastError };
}
