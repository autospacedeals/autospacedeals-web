import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { reviewSubmissionAction } from "./actions";
import StageDealForm from "./StageDealForm";
import RefreshSamplePhotosButton from "./RefreshSamplePhotosButton";

export const metadata: Metadata = {
  title: "Admin — Submission Queue",
};

interface Broker {
  business_name: string;
  seller_type: string;
  contact_phone: string;
  city: string;
  state: string;
}

interface Submission {
  id: string;
  broker_id: string;
  source_type: "link" | "google_sheet" | "excel_file" | "free_text" | "screenshot" | "manual";
  source_url: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  created_at: string;
  brokers: Broker | null;
}

const SOURCE_TYPE_LABELS: Record<Submission["source_type"], string> = {
  // No longer accepted from brokers; older rows still show here.
  link: "Forum post / website",
  google_sheet: "Google Sheet",
  excel_file: "Excel file",
  free_text: "Typed up",
  screenshot: "Screenshot",
  manual: "Added manually",
};

const STATUS_ORDER: Record<Submission["status"], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

export default async function AdminSubmissionsPage() {
  await requireAdmin("/admin/submissions");

  const admin = createAdminClient();
  const { data: submissions } = await admin
    .from("submissions")
    .select(
      "id, broker_id, source_type, source_url, notes, status, admin_notes, created_at, brokers ( business_name, seller_type, contact_phone, city, state )"
    )
    .order("created_at", { ascending: false })
    .returns<Submission[]>();

  const sorted = [...(submissions ?? [])].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  );

  const fileLinks: Record<string, string> = {};
  for (const s of sorted) {
    if (s.source_type === "excel_file") {
      const { data } = await admin.storage
        .from("broker-uploads")
        .createSignedUrl(s.source_url, 60 * 10);
      if (data?.signedUrl) fileLinks[s.id] = data.signedUrl;
    }
  }

  const pendingCount = sorted.filter((s) => s.status === "pending").length;

  return (
    <main className="container-page max-w-5xl py-10 sm:py-12">
      <p className="eyebrow">Admin</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="type-page text-3xl sm:text-3xl">Submission queue</h1>
        <Link href="/admin/messages" className="btn btn-secondary btn-sm">
          All messages
        </Link>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        {pendingCount} pending · {sorted.length} total. Brokers now add their own cars right after
        submitting a link/sheet/file, so nothing here needs your approval to go live. This is just
        a reference log of what they&apos;ve linked — use &quot;Stage a car&quot; below only if you
        want to help a broker out directly, or approve/reject to keep the log tidy.
      </p>

      <RefreshSamplePhotosButton />

      <div className="mt-8 space-y-3">
        {sorted.length === 0 && (
          <div className="card p-8 text-center text-sm text-fg-muted">
            No submissions yet.
          </div>
        )}

        {sorted.map((s) => (
          <div key={s.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-fg">{s.brokers?.business_name ?? "Unknown broker"}</p>
                <p className="text-xs text-fg-muted">
                  {s.brokers?.seller_type} · {s.brokers?.city}, {s.brokers?.state} ·{" "}
                  {s.brokers?.contact_phone}
                </p>
              </div>
              <span
                className={`pill capitalize ${
                  s.status === "pending"
                    ? "pill-warning"
                    : s.status === "approved"
                      ? "pill-success"
                      : "pill-danger"
                }`}
              >
                {s.status}
              </span>
            </div>

            <p className="label mt-3">
              {SOURCE_TYPE_LABELS[s.source_type]}
            </p>
            <div className="mt-1">
              {s.source_type === "excel_file" ? (
                fileLinks[s.id] ? (
                  <a
                    href={fileLinks[s.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link inline-flex items-center gap-1.5 text-sm"
                  >
                    Download file <ExternalLink size={13} />
                  </a>
                ) : (
                  <p className="text-sm text-fg-muted">File uploaded</p>
                )
              ) : (
                <a
                  href={s.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link inline-flex items-center gap-1.5 break-all text-sm"
                >
                  {s.source_url} <ExternalLink size={13} className="shrink-0" />
                </a>
              )}
            </div>

            {s.notes && <p className="mt-2 text-sm break-words text-fg-secondary">Broker notes: {s.notes}</p>}

            <p className="mt-3 text-xs text-fg-muted">
              Submitted{" "}
              {new Date(s.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>

            {s.status === "pending" ? (
              <form action={reviewSubmissionAction} className="mt-4 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={s.id} />
                <textarea
                  name="adminNotes"
                  aria-label="Notes for the broker"
                  placeholder="Notes for the broker (shown to them if rejected)"
                  className="textarea min-h-16 resize-y"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    name="status"
                    value="approved"
                    className="btn btn-primary btn-sm"
                  >
                    Approve
                  </button>
                  <button
                    type="submit"
                    name="status"
                    value="rejected"
                    className="btn btn-danger btn-sm"
                  >
                    Reject
                  </button>
                </div>
              </form>
            ) : null}

            {s.status === "pending" && (
              <StageDealForm
                submissionId={s.id}
                brokerId={s.broker_id}
                defaultSourceUrl={s.source_type !== "excel_file" ? s.source_url : undefined}
              />
            )}

            {s.status !== "pending" && (
              s.admin_notes && (
                <p className="mt-3 rounded-lg bg-hover px-3 py-2 text-sm break-words text-fg-muted">
                  Admin notes: {s.admin_notes}
                </p>
              )
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
