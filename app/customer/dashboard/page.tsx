import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, MapPin, Heart, Bell, ArrowRight, MessageSquare, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSavedDeals, SAVED_DEALS_LIST_LIMIT, type SavedDeals } from "@/lib/supabase/saved-deals";
import { getSavedSearches, type SavedSearches } from "@/lib/supabase/saved-searches";
import { describeFilters, savedSearchDate } from "@/lib/saved-searches";
import { signOutAction } from "../actions";
import ProfileEditor from "./ProfileEditor";
import SavedDealsList from "./SavedDealsList";
import SavedSearchesList from "./SavedSearchesList";
import MessageEmailsToggle from "@/components/messages/MessageEmailsToggle";
import SmsSettings from "@/components/messages/SmsSettings";
import AccountSettings from "@/components/account/AccountSettings";
import { hasPasswordLogin } from "@/lib/account";
import { formatE164, isSmsConfigured } from "@/lib/twilio";
import { CONVERSATION_COLUMNS, isUnreadFor, type ConversationRow } from "@/lib/messages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Account",
};

interface Customer {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  zip_code: string;
  phone: string | null;
  message_emails: boolean;
  address: string | null;
  current_vehicle: string | null;
  drivers_license_path: string | null;
  insurance_card_path: string | null;
}

export default async function CustomerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/customer/login");

  // Started now, awaited after the profile — it never throws (and reports
  // "unavailable" before the saved_deals migration has been run).
  const savedDealsPromise = getSavedDeals(user.id);
  // Same for saved searches (the 0017 migration).
  const savedSearchesPromise = getSavedSearches(user.id);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select(
      "first_name, middle_name, last_name, zip_code, phone, message_emails, address, current_vehicle, drivers_license_path, insurance_card_path"
    )
    .eq("id", user.id)
    .single<Customer>();

  // No customer profile yet: most likely a first "Continue with Google"
  // sign-in that didn't finish the zip-code step — send them back to it
  // (that page sends brokers on to their own dashboard).
  // (.single() reports "no row" as error PGRST116; any other error is a
  // real failure and falls through to the degraded page below.)
  if (!customer && (!customerError || customerError.code === "PGRST116")) {
    redirect("/customer/complete-profile");
  }

  // A customer row should always exist post-signup — if it's somehow
  // missing (e.g. the profile insert failed), degrade gracefully instead of
  // crashing the page.
  const firstName = customer?.first_name ?? "";
  const middleName = customer?.middle_name ?? "";
  const lastName = customer?.last_name ?? "";

  // Short-lived signed URLs so the customer can view their own uploaded
  // documents from the private bucket — generated fresh on every page load
  // rather than stored, since they expire.
  const [licenseUrl, insuranceUrl] = await Promise.all([
    customer?.drivers_license_path
      ? supabase.storage
          .from("customer-uploads")
          .createSignedUrl(customer.drivers_license_path, 300)
          .then(({ data }) => data?.signedUrl ?? null)
      : Promise.resolve(null),
    customer?.insurance_card_path
      ? supabase.storage
          .from("customer-uploads")
          .createSignedUrl(customer.insurance_card_path, 300)
          .then(({ data }) => data?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);
  const smsAvailable = isSmsConfigured();
  const [savedDeals, savedSearches, { data: conversations }, { data: sms }] = await Promise.all([
    savedDealsPromise,
    savedSearchesPromise,
    supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("customer_id", user.id).returns<ConversationRow[]>(),
    smsAvailable
      ? supabase.from("sms_settings").select("phone, enabled").eq("user_id", user.id).maybeSingle<{ phone: string | null; enabled: boolean }>()
      : Promise.resolve({ data: null }),
  ]);
  const unreadMessages = (conversations ?? []).filter((c) => isUnreadFor("customer", c)).length;

  return (
    <main className="container-page max-w-5xl py-10 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">My account</p>
          <h1 className="type-page mt-3 text-3xl sm:text-4xl">
            Welcome{firstName ? `, ${firstName}` : ""}
          </h1>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-secondary btn-sm">
            <LogOut /> Sign out
          </button>
        </form>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <div className="panel sm:p-8 lg:col-span-1">
          <h2 className="type-title">Profile</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="label">Name</dt>
              <dd className="mt-1 font-medium text-fg">
                {[firstName, middleName, lastName].filter(Boolean).join(" ")}
              </dd>
            </div>
            <div>
              <dt className="label flex items-center gap-1.5">
                <MapPin size={13} className="text-fg-faint" /> Zip code
              </dt>
              <dd className="mt-1 font-medium text-fg">{customer?.zip_code ?? "—"}</dd>
            </div>
            <div>
              <dt className="label">Email</dt>
              <dd className="mt-1 font-medium wrap-anywhere text-fg">{user.email}</dd>
            </div>
            <div>
              <dt className="label">Phone</dt>
              <dd className="mt-1 font-medium text-fg">
                {customer?.phone ?? <span className="text-warning">Not added yet — add it under Edit profile</span>}
              </dd>
            </div>
          </dl>

          <ProfileEditor
            firstName={firstName}
            middleName={middleName}
            lastName={lastName}
            zipCode={customer?.zip_code ?? ""}
            phone={customer?.phone ?? ""}
            address={customer?.address ?? null}
            currentVehicle={customer?.current_vehicle ?? null}
            hasLicense={Boolean(customer?.drivers_license_path)}
            hasInsurance={Boolean(customer?.insurance_card_path)}
            licenseUrl={licenseUrl}
            insuranceUrl={insuranceUrl}
          />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <section id="messages" aria-labelledby="messages-heading" className="panel sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="messages-heading" className="panel-title">
                <MessageSquare /> Messages
                {unreadMessages > 0 && <span className="pill pill-accent">{unreadMessages} unread</span>}
              </h2>
              <Link href="/customer/messages" className="link-arrow">
                Open messages <ArrowRight />
              </Link>
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              {(conversations ?? []).length > 0
                ? `${(conversations ?? []).length} conversation${(conversations ?? []).length === 1 ? "" : "s"} with sellers.`
                : "Message a seller from any listing — replies show up here."}
            </p>
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              <MessageEmailsToggle initialEnabled={customer?.message_emails ?? true} />
              {smsAvailable && (
                <SmsSettings
                  enabledPhone={sms?.enabled && sms.phone ? formatE164(sms.phone) : null}
                  defaultPhone={customer?.phone ?? ""}
                />
              )}
            </div>
          </section>

          <SavedDealsSection savedDeals={savedDeals} />

          <SavedSearchesSection savedSearches={savedSearches} />

          <section id="account" aria-labelledby="account-heading" className="panel sm:p-8">
            <h2 id="account-heading" className="panel-title">
              <UserCog /> Account
            </h2>
            <div className="mt-5">
              <AccountSettings
                email={user.email ?? ""}
                pendingEmail={user.new_email ?? null}
                hasPassword={hasPasswordLogin(user)}
                role="customer"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

// The customer's saved deals as regular deal cards (the heart on each one
// removes it, see SavedDealsList), two across from tablet width up. Not
// wrapped in a panel so the cards sit on the page like everywhere else
// instead of nesting.
function SavedDealsSection({ savedDeals }: { savedDeals: SavedDeals }) {
  const { deals, total, available } = savedDeals;

  return (
    <section aria-labelledby="saved-deals-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="saved-deals-heading" className="panel-title">
          <Heart /> Saved deals
        </h2>
        {available && deals.length > 0 && (
          <Link href="/#deals" className="link-arrow min-h-9 pointer-coarse:min-h-11">
            Browse more deals <ArrowRight />
          </Link>
        )}
      </div>

      {!available ? (
        <div className="panel mt-4 sm:p-8">
          <p className="text-sm text-fg-muted">
            Saved deals aren&apos;t available right now. Please check back soon.
          </p>
        </div>
      ) : deals.length === 0 ? (
        <div className="card mt-4 flex flex-col items-center px-6 py-12 text-center">
          <div className="grid size-12 place-items-center rounded-full border border-line-strong bg-raised text-fg-muted">
            <Heart size={20} />
          </div>
          <p className="type-title mt-5">No saved deals yet</p>
          <p className="mt-2 max-w-sm text-sm text-fg-muted">
            Save any deal with the heart button and it&apos;ll show up here, so you can come back to
            it anytime.
          </p>
          <Link href="/#deals" className="btn btn-secondary mt-6">
            Browse deals
          </Link>
        </div>
      ) : (
        <>
          <SavedDealsList deals={deals} />
          {total > SAVED_DEALS_LIST_LIMIT && (
            <p className="mt-4 text-xs text-fg-muted">
              Showing your {SAVED_DEALS_LIST_LIMIT} most recently saved deals.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// Saved searches and their email alerts (the #alerts anchor is where "Save
// this search" and every alert email's "Manage alerts" link land). Each one
// shows its name, what it filters on, and when it was saved and last
// alerted, with a delete button.
function SavedSearchesSection({ savedSearches }: { savedSearches: SavedSearches }) {
  const { searches, available } = savedSearches;
  const items = searches.map((search) => ({
    id: search.id,
    label: search.label,
    summary: describeFilters(search.filters)
      .map((item) => `${item.name}: ${item.value}`)
      .join(" · "),
    created: savedSearchDate(search.createdAt),
    lastAlerted: savedSearchDate(search.lastAlertedAt),
  }));

  return (
    <section id="alerts" aria-labelledby="alerts-heading" className="panel sm:p-8">
      {/* tabIndex: focus lands here after the last saved search is deleted. */}
      <h2 id="alerts-heading" tabIndex={-1} className="panel-title outline-none">
        <Bell /> Saved searches &amp; alerts
      </h2>

      {!available ? (
        <p className="mt-2 text-sm text-fg-muted">
          Saved searches aren&apos;t available right now. Please check back soon.
        </p>
      ) : (
        <SavedSearchesList
          searches={items}
          intro={
            <p className="mt-2 text-sm text-fg-muted">
              We&apos;ll email you when new deals match any of these. Every alert email also has a
              link to stop that alert.
            </p>
          }
          emptyState={
            <>
              <p className="mt-2 text-sm text-fg-muted">
                No saved searches yet. On the deals page, set the filters you care about (body
                style, budget, location…), then choose{" "}
                <span className="font-medium text-fg">Save this search</span> at the bottom of the
                filters. We&apos;ll email you when a new matching deal is posted.
              </p>
              <Link href="/#deals" className="btn btn-secondary mt-5">
                Browse deals
              </Link>
            </>
          }
        />
      )}
    </section>
  );
}
