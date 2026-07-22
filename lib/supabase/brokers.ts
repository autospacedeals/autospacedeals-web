// Public-facing broker profile data (the "About this broker" page) — reads
// via the anon client since anyone can view a broker's basic info, same as
// anyone can already view their listings.
import { createClient as createAnonClient } from "@supabase/supabase-js";

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
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("brokers")
    .select("id, business_name, seller_type, city, state, contact_phone, about")
    .eq("id", id)
    .maybeSingle<BrokerRow>();

  if (error || !data) return null;

  return {
    id: data.id,
    businessName: data.business_name,
    sellerType: data.seller_type,
    city: data.city,
    state: data.state,
    contactPhone: data.contact_phone,
    about: data.about,
  };
}
