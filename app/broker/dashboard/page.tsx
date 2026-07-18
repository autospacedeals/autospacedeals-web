import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut, Store, Clock, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { mapRowToDeal, type DealRow } from "@/lib/supabase/deals";
import { signOutAction } from "../actions";
import NewSubmissionForm from "./NewSubmissionForm";
import DraftConfirmList from "./DraftConfirmList";
import MyListings from "./MyListings";

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
  contact_phone: string;
  city: string;
  state: string;
}

interface Submission {
  id: string;
  source_type: "link" | "google_sheet" | "excel_file";
  source_url: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<Submission["status"], string> = {
  pending: "bg-amber-500/15 text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-red-500/15 text-red-300",
};

const STATUS_ICONS: Record<Submission["status"], typeof Clock> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
};

const SOURCE_TYPE_LABELS: Record<Submission["source_type"], string> = {
  link: "Forum post / website",
  google_sheet: "Google Sheet",
  excel_file: "Excel file",
};

export default async function BrokerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/broker/login");

  const { data: broker } = await supabase
    .from("brokers")
    .select("id, contact_name, business_name, seller_type, contact_phone, city, state")
    .eq("id", user.id)
    .single<Broker>();

  const { data: submissions } = await supabase
    .from("submissions")
    .select("id, source_type, source_url, notes, status, admin_notes, created_at")
    .eq("broker_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Submission[]>();

  // Excel files are stored in a private bucket — generate short-lived signed
  // URLs so the broker can view what they uploaded.
  const fileLinks: Record<string, string> = {};
  for (const s of submissions ?? []) {
    if (s.source_type === "excel_file") {
      const { data } = await supabase.storage
        .from("broker-uploads")
        .createSignedUrl(s.source_url, 60 * 10);
      if (data?.signedUrl) fileLinks[s.id] = data.signedUrl;
    }
  }

  const DEAL_COLUMNS =
    "id, slug, broker_id, year, make, model, trim, body_style, fuel, exterior, interior, " +
    "deal_type, msrp, selling_price, payment, due_at_signing, term, miles_per_year, apr, " +
    "seller_type, seller_name, seller_phone, seller_email, city, state, " +
    "verified, in_stock, popularity, date_posted, badge, notes, packages, images, " +
    "source_url, sample, one_pay, status, submission_id, condition, incentives, photo_auto_sourced";

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
        <div className="mt-6">
          <NewSubmissionForm />
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-bold">Your submissions</h2>
        {!submissions || submissions.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-500">
            No submissions yet — use the form above to send us your first source.
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s) => {
              const StatusIcon = STATUS_ICONS[s.status];
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
                      {SOURCE_TYPE_LABELS[s.source_type]}
                    </div>
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[s.status]}`}
                    >
                      <StatusIcon size={12} /> {s.status}
                    </span>
                  </div>

                  <div className="mt-2">
                    {s.source_type === "excel_file" ? (
                      fileLinks[s.id] ? (
                        <a
                          href={fileLinks[s.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm font-semibold text-white hover:underline"
                        >
                          View uploaded file <ExternalLink size={13} />
                        </a>
                      ) : (
                        <p className="text-sm text-zinc-500">File uploaded</p>
                      )
                    ) : (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 break-all text-sm font-semibold text-white hover:underline"
                      >
                        {s.source_url} <ExternalLink size={13} className="shrink-0" />
                      </a>
                    )}
                  </div>

                  {s.notes && <p className="mt-2 text-sm text-zinc-400">{s.notes}</p>}
                  {s.status === "rejected" && s.admin_notes && (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {s.admin_notes}
                    </p>
                  )}

                  <p className="mt-3 text-xs text-zinc-600">
                    Submitted {new Date(s.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
