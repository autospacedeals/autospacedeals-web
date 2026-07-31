// Public-facing broker profile data (the "About this broker" page) — reads
// via the anon client since anyone can view a broker's basic info, same as
// anyone can already view their listings.
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { withTimeout } from "./with-timeout";

export interface BrokerProfile {
  id: string;
  businessName: string;
  sellerType: string;
  city: string;
  state: string;
  contactPhone: string;
  about: string | null;
}

interface BrokerRow {
  id: string;
  business_name: string;
  seller_type: string;
  city: string;
  state: string;
  contact_phone: string;
  about: string | null;
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
        .select("id, business_name, seller_type, city, state, contact_phone, about")
        .eq("id", id)
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
      city: data.city ?? "",
      state: data.state ?? "",
      contactPhone: data.contact_phone ?? "",
      about: data.about,
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
