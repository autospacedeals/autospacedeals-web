import { getPublishedDeals } from "@/lib/supabase/deals";
import { getSavedSearchesAvailable } from "@/lib/supabase/saved-searches";
import HomeClient from "@/components/HomeClient";

// Always fetch fresh — brokers can add/edit/remove their own listings from
// their dashboard at any time, and those changes should show up on the live
// site immediately rather than waiting for a rebuild.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Neither throws: the availability check just says false (and logs) if
  // the saved-searches migration hasn't been run yet.
  const [deals, savedSearchesAvailable] = await Promise.all([
    getPublishedDeals(),
    getSavedSearchesAvailable(),
  ]);
  return <HomeClient initialDeals={deals} savedSearchesAvailable={savedSearchesAvailable} />;
}
