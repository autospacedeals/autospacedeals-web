import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { mapRowToDeal, type DealRow } from "@/lib/supabase/deals";
import { signOutAction } from "../actions";
import NewSubmissionForm from "./NewSubmissionForm";
import DraftConfirmList from "./DraftConfirmList";
import MyListings from "./MyListings";
import AboutEditor from "./AboutEditor";

// Always fetch fresh so the broker's own edits (price changes, drafts
// confirmed, listings removed) show up immediately, not from a stale cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Broker Dashboard",
};

interface Broker {
  id: string;
  contact_name: string | null;
  business_name: string;
  seller_type: string;
  dealership_name: string | null;
  contact_phone: string;
  city: string;
  state: string;
  about: string | null;
}

export default async function BrokerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const { data: broker } = await supabase
    .from("brokers")
    .select(
      "id, contact_name, business_name, seller_type, dealership_name, contact_phone, city, state, about"
    )
    .eq("id", user.id)
    .single<Broker>();

  const DEAL_COLUMNS =
    "id, slug, broker_id, year, make, model, trim, body_style, fuel, exterior, interior, " +
    "deal_type, msrp, selling_price, payment, due_at_signing, term, miles_per_year, apr, " +
    "seller_type, seller_name, seller_dealership, seller_phone, seller_email, city, state, " +
    "verified, in_stock, popularity, date_posted, badge, notes, packages, images, " +
    "source_url, sample, one_pay, status, submission_id, condition, incentives, photo_auto_sourced, " +
    "due_at_signing_tax_rate, payment_tax_rate, mask_msrp";

  const { data: myDealRows } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("broker_id", user.id)
    .order("created_at", { ascending: false })
    .returns<DealRow[]>();

  const draftRows = (myDealRows ?? []).filter((r) => r.status === "draft");
  const publishedRows = (myDealRows ?? []).filter((r) => r.status === "published");
  const pendingDrafts = draftRows.map(mapRowToDeal);
  const publishedListings = publishedRows.map(mapRowToDeal);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-400">
            <Store size={16} /> {broker?.seller_type ?? "Broker"} dashboard
          </p>
          <h1 className="mt-1 text-3xl font-black">{broker?.business_name ?? user.email}</h1>
          {broker?.dealership_name && (
            <p className="text-sm text-zinc-400">at {broker.dealership_name}</p>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            {broker?.contact_name && `${broker.contact_name} · `}
            {broker?.city}, {broker?.state} · {broker?.contact_phone} · {user.email}
          </p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut size={15} /> Sign out
          </button>
        </form>
      </div>

      <AboutEditor about={broker?.about ?? null} brokerId={user.id} />

      {pendingDrafts.length > 0 && (
        <div className="mt-8">
          <DraftConfirmList drafts={pendingDrafts} />
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-bold">Your live listings</h2>
        <MyListings deals={publishedListings} />
      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
        <h2 className="text-lg font-bold">Add inventory</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Add a car directly, or link a forum thread, your website, a Google Sheet, or a
          spreadsheet — either way, you publish it yourself and it&apos;s live right away.
        </p>
        <p className="mt-2 text-xs text-amber-300/80">
          Reminder: always show the full due-at-signing amount, and disclose your assumed tax
          rate if the payment or due-at-signing figure bakes one in. Repeated false advertising
          gets an account removed.
        </p>
        <div className="mt-6">
          <NewSubmissionForm />
        </div>
      </div>
    </main>
  );
}
