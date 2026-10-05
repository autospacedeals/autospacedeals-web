import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogOut, MessageSquare, UserCog } from "lucide-react";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { CONVERSATION_COLUMNS, isUnreadFor, type ConversationRow } from "@/lib/messages";
import MessageEmailsToggle from "@/components/messages/MessageEmailsToggle";
import SmsSettings from "@/components/messages/SmsSettings";
import AccountSettings from "@/components/account/AccountSettings";
import { hasPasswordLogin } from "@/lib/account";
import { formatE164, isSmsConfigured } from "@/lib/twilio";
import { shareEmail } from "@/lib/google-reader";
import { serviceAccountEmail } from "@/lib/google-service-account";
import { accountHome } from "@/lib/account-home";
import { mapRowToDeal, type DealRow } from "@/lib/supabase/deals";
import { signOutAction } from "../actions";
import NewSubmissionForm from "./NewSubmissionForm";
import DraftConfirmList from "./DraftConfirmList";
import MyListings from "./MyListings";
import RemovedListings from "./RemovedListings";
import AboutEditor from "./AboutEditor";
import SheetSyncManager, { type SheetSync } from "./SheetSyncManager";

// Always fetch fresh so the broker's own edits (price changes, drafts
// confirmed, listings removed) show up immediately, not from a stale cache.
export const dynamic = "force-dynamic";
// Server actions on this page include reading a whole Google Sheet (every
// tab, in AI batches) and saving its cars, which can take a few minutes for
// a big inventory.
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "Broker Dashboard",
};

interface Broker {
  id: string;
  contact_name: string | null;
  business_name: string;
  seller_type: string;
  dealership_name: string | null;
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

  const { data: broker, error: brokerError } = await supabase
    .from("brokers")
    .select(
      "id, contact_name, business_name, seller_type, dealership_name, city, state, about"
    )
    .eq("id", user.id)
    .single<Broker>();
  // Only broker accounts get this dashboard — a shopper (or the admin)
  // signed in here goes to their own. (.single() reports "no row" as
  // PGRST116; any other error is a failed lookup, not proof of no broker.)
  if (!broker && (!brokerError || brokerError.code === "PGRST116")) {
    redirect(await accountHome(supabase, user));
  }

  const DEAL_COLUMNS =
    "id, slug, broker_id, year, make, model, trim, body_style, fuel, exterior, interior, " +
    "deal_type, msrp, selling_price, payment, due_at_signing, term, miles_per_year, apr, " +
    "seller_type, seller_name, seller_dealership, city, state, " +
    "verified, in_stock, popularity, date_posted, badge, notes, packages, images, " +
    "source_url, sample, one_pay, status, submission_id, condition, incentives, photo_auto_sourced, " +
    "due_at_signing_tax_rate, payment_tax_rate, mask_msrp, msrp_masked_label, broker_fee, removed_at, " +
    "sheet_sync_id, sheet_tab, msd_count, msd_total, mileage_options, delivery";

  const { data: myDealRows, error: dealsError } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("broker_id", user.id)
    .order("created_at", { ascending: false })
    .returns<DealRow[]>();

  // A failed query here (e.g. a database migration that hasn't been run
  // yet, so a selected column doesn't exist) used to fail silently and
  // just render as "no drafts/listings" — log it loudly so a schema
  // mismatch shows up in the server logs instead of just looking like a
  // broken upload with no clue why.
  if (dealsError) {
    console.error("Broker dashboard: failed to load deals for broker", user.id, dealsError.message);
  }

  const draftRows = (myDealRows ?? []).filter((r) => r.status === "draft");
  const publishedRows = (myDealRows ?? []).filter((r) => r.status === "published");
  const removedRows = (myDealRows ?? []).filter((r) => r.status === "removed");
  const pendingDrafts = draftRows.map(mapRowToDeal);
  const publishedListings = publishedRows.map(mapRowToDeal);
  const removedListings = removedRows
    .map(mapRowToDeal)
    .sort((a, b) => (a.removedAt && b.removedAt ? (a.removedAt < b.removedAt ? 1 : -1) : 0));

  const { data: sheetSyncRows } = await supabase
    .from("sheet_syncs")
    .select("id, sheet_url, auto_publish, active, last_synced_at, last_sync_added, last_sync_removed, last_sync_error, tabs, disabled_tabs")
    .eq("broker_id", user.id)
    .order("created_at", { ascending: false })
    .returns<
      {
        id: string;
        sheet_url: string;
        auto_publish: boolean;
        active: boolean;
        last_synced_at: string | null;
        last_sync_added: number;
        last_sync_removed: number;
        last_sync_error: string | null;
        tabs: string[] | null;
        disabled_tabs: string[] | null;
      }[]
    >();

  // Cars a live sheet created are shown under that sheet, apart from the
  // ones added by hand. A listing whose sheet was unlinked has its
  // sheet_sync_id cleared, so it falls back into "Added manually".
  const syncIds = new Set((sheetSyncRows ?? []).map((s) => s.id));
  const syncedListingsBySync: Record<string, typeof publishedListings> = {};
  const manualListings: typeof publishedListings = [];
  for (const deal of publishedListings) {
    if (deal.sheetSyncId && syncIds.has(deal.sheetSyncId)) {
      (syncedListingsBySync[deal.sheetSyncId] ??= []).push(deal);
    } else {
      manualListings.push(deal);
    }
  }

  const sheetSyncs: SheetSync[] = (sheetSyncRows ?? []).map((s) => ({
    id: s.id,
    sheetUrl: s.sheet_url,
    autoPublish: s.auto_publish,
    active: s.active,
    lastSyncedAt: s.last_synced_at,
    lastSyncAdded: s.last_sync_added,
    lastSyncRemoved: s.last_sync_removed,
    lastSyncError: s.last_sync_error,
    tabs: s.tabs ?? [],
    disabledTabs: s.disabled_tabs ?? [],
  }));

  // Contact phone and the message-email setting aren't readable through
  // the public API (0024_messaging.sql), so the broker's own come from the
  // server side.
  const smsAvailable = isSmsConfigured();
  const [{ data: privateProfile }, { data: conversations }, { data: sms }] = await Promise.all([
    createAdminClient()
      .from("brokers")
      .select("contact_phone, message_emails")
      .eq("id", user.id)
      .maybeSingle<{ contact_phone: string; message_emails: boolean }>(),
    supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("broker_id", user.id).returns<ConversationRow[]>(),
    smsAvailable
      ? supabase.from("sms_settings").select("phone, enabled").eq("user_id", user.id).maybeSingle<{ phone: string | null; enabled: boolean }>()
      : Promise.resolve({ data: null }),
  ]);
  const unreadMessages = (conversations ?? []).filter((c) => isUnreadFor("broker", c)).length;

  return (
    <main className="container-page max-w-[1600px] py-10 sm:py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">{broker?.seller_type ?? "Broker"} dashboard</p>
          <h1 className="type-page mt-3 text-3xl break-words sm:text-3xl">{broker?.business_name ?? user.email}</h1>
          {broker?.dealership_name && (
            <p className="mt-1 text-sm break-words text-fg-muted">at {broker.dealership_name}</p>
          )}
          <p className="mt-1 text-sm break-words text-fg-muted">
            {broker?.contact_name && `${broker.contact_name} · `}
            {broker?.city}, {broker?.state}
            {privateProfile?.contact_phone ? ` · ${privateProfile.contact_phone}` : ""} · {user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/broker/dashboard/messages" className="btn btn-primary btn-sm">
            <MessageSquare /> Messages
            {unreadMessages > 0 && <span className="pill pill-neutral">{unreadMessages} new</span>}
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="btn btn-secondary btn-sm">
              <LogOut /> Sign out
            </button>
          </form>
        </div>
      </div>

      <div id="messages" className="mt-4 max-w-xl space-y-4">
        <MessageEmailsToggle initialEnabled={privateProfile?.message_emails ?? true} />
        {smsAvailable && (
          <SmsSettings
            enabledPhone={sms?.enabled && sms.phone ? formatE164(sms.phone) : null}
            defaultPhone={privateProfile?.contact_phone ?? ""}
          />
        )}
      </div>

      <AboutEditor about={broker?.about ?? null} brokerId={user.id} />

      {dealsError && (
        <div className="alert alert-danger mt-8">
          We couldn&apos;t load your listings right now — this looks like an issue on our end, not
          something wrong with what you uploaded. Try refreshing, and contact support if it keeps
          happening.
        </div>
      )}

      {pendingDrafts.length > 0 && (
        <div id="pending-drafts" className="mt-8">
          <DraftConfirmList drafts={pendingDrafts} />
        </div>
      )}

      {sheetSyncs.length > 0 ? (
        <>
          <SheetSyncManager
            syncs={sheetSyncs}
            listingsBySync={syncedListingsBySync}
          />

          <section className="mt-10">
            <h2 className="type-title">Added manually</h2>
            <p className="mt-1 mb-4 text-sm text-fg-secondary">
              Cars you added by hand, from photos or pasted text, or from a one-time upload.
            </p>
            <MyListings
              deals={manualListings}
              emptyMessage="No manually added cars — everything live is coming from your sheet."
            />
          </section>
        </>
      ) : (
        <div className="mt-8">
          <h2 className="type-title mb-4">Your live listings</h2>
          <MyListings deals={publishedListings} />
        </div>
      )}

      <RemovedListings deals={removedListings} />

      <div className="panel mt-8 sm:p-8">
        <h2 className="type-title">Add inventory</h2>
        <p className="mt-1 text-sm text-fg-secondary">
          Add a car directly, or bring in a Google Sheet, a spreadsheet file, pasted text, or a
          screenshot — either way, you publish it yourself and it&apos;s live right away.
        </p>
        <p className="mt-2 text-xs leading-5 text-warning">
          Reminder: always show the full due-at-signing amount, and disclose your assumed tax
          rate if the payment or due-at-signing figure bakes one in. Repeated false advertising
          gets an account removed.
        </p>
        <div className="mt-6">
          <NewSubmissionForm
            sheetShareEmail={await shareEmail(serviceAccountEmail())}
            brokerLocation={{ city: broker?.city ?? "", state: broker?.state ?? "" }}
          />
        </div>
      </div>

      <section id="account" aria-labelledby="account-heading" className="panel mt-8 max-w-3xl sm:p-8">
        <h2 id="account-heading" className="panel-title">
          <UserCog /> Account
        </h2>
        <div className="mt-5">
          <AccountSettings
            email={user.email ?? ""}
            pendingEmail={user.new_email ?? null}
            hasPassword={hasPasswordLogin(user)}
            role="broker"
            liveListings={publishedListings.length}
          />
        </div>
      </section>
    </main>
  );
}
