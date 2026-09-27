import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut, MapPin, Heart, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "../actions";
import ProfileEditor from "./ProfileEditor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Account",
};

interface Customer {
  first_name: string;
  last_name: string;
  zip_code: string;
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

  const { data: customer } = await supabase
    .from("customers")
    .select(
      "first_name, last_name, zip_code, address, current_vehicle, drivers_license_path, insurance_card_path"
    )
    .eq("id", user.id)
    .single<Customer>();

  // A customer row should always exist post-signup — if it's somehow
  // missing (e.g. the profile insert failed), degrade gracefully instead of
  // crashing the page.
  const firstName = customer?.first_name ?? "";
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
                {firstName} {lastName}
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
          </dl>

          <ProfileEditor
            firstName={firstName}
            lastName={lastName}
            zipCode={customer?.zip_code ?? ""}
            address={customer?.address ?? null}
            currentVehicle={customer?.current_vehicle ?? null}
            hasLicense={Boolean(customer?.drivers_license_path)}
            hasInsurance={Boolean(customer?.insurance_card_path)}
            licenseUrl={licenseUrl}
            insuranceUrl={insuranceUrl}
          />
        </div>

        {/* Placeholder sections for upcoming features */}
        <div className="space-y-6 lg:col-span-2">
          <div className="panel sm:p-8">
            <h2 className="panel-title">
              <Heart /> Saved deals
            </h2>
            <p className="mt-2 text-sm text-fg-muted">
              Coming soon — save deals you&apos;re interested in and come back to them anytime.
            </p>
          </div>

          <div className="panel sm:p-8">
            <h2 className="panel-title">
              <Bell /> Saved searches &amp; alerts
            </h2>
            <p className="mt-2 text-sm text-fg-muted">
              Coming soon — set your filters once and we&apos;ll email you when a matching deal
              gets posted.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
