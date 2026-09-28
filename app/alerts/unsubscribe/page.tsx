import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/supabase/with-timeout";
import { isMissingRelationError } from "@/lib/supabase/saved-searches";
import { MANAGE_ALERTS_PATH, parseSavedSearchFilters, savedSearchLabel } from "@/lib/saved-searches";
import { LogoMark } from "@/components/Logo";
import UnsubscribeForm from "./UnsubscribeForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stop Alerts",
  description: "Stop email alerts for a saved search on Drive.",
  // A one-off link from an email: keep it out of search results, and don't
  // pass the token on to anywhere this page links.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Lookup =
  | { status: "found"; label: string }
  | { status: "invalid" }
  | { status: "unavailable" };

// The link in every alert email (/alerts/unsubscribe?token=…). Opening it
// only shows which alert it's for; stopping it takes a button press (a POST
// server action), so a mail scanner that prefetches links can't unsubscribe
// anyone. The token is the only credential, so the lookup is keyed strictly
// on it (uuid-checked) with the service role, and reads just the label.
async function lookUpToken(token: string | null): Promise<Lookup> {
  if (!token || !UUID_RE.test(token)) return { status: "invalid" };
  try {
    const supabase = createAdminClient();
    const { data, error } = await withTimeout(
      supabase
        .from("saved_searches")
        .select("label, filters")
        .eq("unsubscribe_token", token)
        .maybeSingle<{ label: string | null; filters: unknown }>(),
      8000,
      "unsubscribe lookup"
    );
    if (error) {
      console.error("unsubscribe lookup failed:", error.code, error.message);
      return isMissingRelationError(error.code) ? { status: "invalid" } : { status: "unavailable" };
    }
    if (!data) return { status: "invalid" };
    const filters = parseSavedSearchFilters(data.filters);
    const label = data.label?.trim() || (filters ? savedSearchLabel(filters) : "your saved search");
    return { status: "found", label };
  } catch (err) {
    console.error("unsubscribe lookup threw:", err);
    return { status: "unavailable" };
  }
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw.trim() : null;
  const lookup = await lookUpToken(token);

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(47_123_255/0.14),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
          <p className="label mt-6">Email alerts</p>

          {lookup.status === "found" ? (
            // Heading and all: the form swaps the whole thing for its
            // confirmation once the alerts are stopped.
            <UnsubscribeForm token={token ?? ""} label={lookup.label} />
          ) : (
            <>
              <h1 className="type-page mt-1 text-3xl sm:text-3xl">
                {lookup.status === "invalid" ? "Link not found" : "Something went wrong"}
              </h1>
              <p className="mt-2 text-sm text-fg-muted">
                {lookup.status === "invalid"
                  ? "This unsubscribe link isn't valid, or these alerts were already stopped. You can see and delete all of your saved searches from your account."
                  : "We couldn't load this alert right now. Please try the link again in a few minutes."}
              </p>
              <Link href={MANAGE_ALERTS_PATH} className="btn btn-secondary mt-8 w-full">
                Manage my alerts
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
