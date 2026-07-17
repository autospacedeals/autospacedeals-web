import { getPublishedDeals } from "@/lib/supabase/deals";
import HomeClient from "@/components/HomeClient";

// Always fetch fresh — brokers can add/edit/remove their own listings from
// their dashboard at any time, and those changes should show up on the live
// site immediately rather than waiting for a rebuild.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const deals = await getPublishedDeals();
  return <HomeClient initialDeals={deals} />;
}
