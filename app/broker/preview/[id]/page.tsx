import { notFound, redirect } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDealByIdForBroker } from "@/lib/supabase/broker-preview";
import DealDetailView from "@/components/DealDetailView";

// Lets a broker see exactly what shoppers will see for one of their own
// deals — draft or already-published — before hitting "Confirm & publish."
// Reuses the same layout as the live /deals/[slug] page (see
// DealDetailView) so there's no gap between the preview and the real thing.
export const dynamic = "force-dynamic";

export default async function BrokerDealPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const deal = await getDealByIdForBroker(id, user.id);
  if (!deal) notFound();

  return (
    <DealDetailView
      deal={deal}
      backHref="/broker/dashboard"
      backLabel="Back to dashboard"
      isPreview
      previewBanner={
        <div className="alert alert-warning mb-6 font-medium">
          <CircleAlert />
          <p>
            Preview only — shoppers can&apos;t see this{" "}
            {deal.status === "draft" ? "until you confirm & publish it" : "in your dashboard view"}.
          </p>
        </div>
      }
    />
  );
}
