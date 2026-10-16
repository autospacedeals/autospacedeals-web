// Public-facing broker profile data (the "About this broker" page) — reads
// via the anon client since anyone can view a broker's basic info, same as
// anyone can already view their listings.
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { withTimeout } from "./with-timeout";

export interface BrokerProfile {
  id: string;
  businessName: string;
  sellerType: string;
  dealershipName: string | null;
  city: string;
  state: string;
  about: string | null;
  // Their uploaded logo (0051_broker_logos.sql), shown instead of initials.
  logoUrl: string | null;
}

interface BrokerRow {
  id: string;
  business_name: string;
  seller_type: string;
  dealership_name: string | null;
  city: string;
  state: string;
  about: string | null;
  logo_url: string | null;
}

function publicClient() {
  return createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function getBrokerProfile(id: string): Promise<BrokerProfile | null> {
  try {
    const supabase = publicClient();
    const { data, error } = await withTimeout(
      supabase
        .from("brokers")
        .select("id, business_name, seller_type, dealership_name, city, state, about, logo_url")
        .eq("id", id)
        // No public page until their license is verified (0038_seller_verification.sql).
        .not("approved_at", "is", null)
        .maybeSingle<BrokerRow>(),
      10000,
      "getBrokerProfile"
    );

    if (error) {
      console.error("getBrokerProfile failed:", error.message);
      return null;
    }
    if (!data) return null;

    return {
      id: data.id,
      businessName: data.business_name ?? "",
      sellerType: data.seller_type ?? "Broker",
      dealershipName: data.dealership_name,
      city: data.city ?? "",
      state: data.state ?? "",
      about: data.about,
      logoUrl: data.logo_url ?? null,
    };
  } catch (err) {
    // Defensive: a thrown (not returned-as-error) exception here — e.g. a
    // network hiccup talking to Supabase — would otherwise take down the
    // whole page with a generic Vercel error screen instead of a normal
    // "not found". Log it so it's visible in Vercel's runtime logs, but
    // degrade to null so the page can still render something sensible.
    console.error("getBrokerProfile threw:", err);
    return null;
  }
}

// Just a seller's logo, for their avatar on a deal page: null when they
// haven't uploaded one (or it can't be read).
export async function getBrokerLogo(id: string): Promise<string | null> {
  try {
    const { data, error } = await withTimeout(
      publicClient().from("brokers").select("logo_url").eq("id", id).maybeSingle<{ logo_url: string | null }>(),
      5000,
      "getBrokerLogo"
    );
    if (error) return null;
    return data?.logo_url ?? null;
  } catch {
    return null;
  }
}

