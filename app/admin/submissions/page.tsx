import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { reviewSubmissionAction } from "./actions";

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
  source_type: "link" | "google_sheet" | "excel_file";
  source_url: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  admin_notes: string | null;
  created_at: string;
  brokers: Broker | null;
}

const SOURCE_TYPE_LABELS: Record<Submission["source_type"], string> = {
  link: "Forum post / website",
  google_sheet: "Google Sheet",
  excel_file: "Excel file",
};

const STATUS_ORDER: Record<Submission["status"], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

export default async function AdminSubmissionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) redirect("/broker/login");

  const admin = createAdminClient();
  const { data: submissions } = await admin
    .from("submissions")
    .select(
      "id, source_type, source_url, notes, status, admin_notes, created_at, brokers ( business_name, seller_type, contact_phone, city, state )"
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
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-400">
        <ShieldCheck size={16} /> Admin
      </p>
      <h1 className="mt-1 text-3xl font-black">Submission queue</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {pendingCount} pending · {sorted.length} total. Approving here doesn&apos;t publish deals
        automatically — pull the source, verify the numbers, and add them to the site the usual
        way, then mark it approved.
      </p>

      <div className="mt-8 space-y-3">
        {sorted.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-500">
            No submissions yet.
          </div>
        )}

        {sorted.map((s) => (
          <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold">{s.brokers?.business_name ?? "Unknown broker"}</p>
                <p className="text-xs text-zinc-500">
                  {s.brokers?.seller_type} · {s.brokers?.city}, {s.brokers?.state} ·{" "}
                  {s.brokers?.contact_phone}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  s.status === "pending"
                    ? "bg-amber-500/15 text-amber-300"
                    : s.status === "approved"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                }`}
              >
                {s.status}
              </span>
            </div>

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {SOURCE_TYPE_LABELS[s.source_type]}
            </p>
            <div className="mt-1">
              {s.source_type === "excel_file" ? (
                fileLinks[s.id] ? (
                  <a
                    href={fileLinks[s.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-semibold text-white hover:underline"
                  >
                    Download file <ExternalLink size={13} />
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

            {s.notes && <p className="mt-2 text-sm text-zinc-400">Broker notes: {s.notes}</p>}

            <p className="mt-3 text-xs text-zinc-600">
              Submitted{" "}
              {new Date(s.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>

            {s.status === "pending" ? (
              <form action={reviewSubmissionAction} className="mt-4 space-y-2 border-t border-white/10 pt-4">
                <input type="hidden" name="id" value={s.id} />
                <textarea
                  name="adminNotes"
                  placeholder="Notes for the broker (shown to them if rejected)"
                  className="min-h-16 w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    name="status"
                    value="approved"
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-emerald-400"
                  >
                    Approve
                  </button>
                  <button
                    type="submit"
                    name="status"
                    value="rejected"
                    className="rounded-xl bg-red-500/90 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-500"
                  >
                    Reject
                  </button>
                </div>
              </form>
            ) : (
              s.admin_notes && (
                <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-zinc-400">
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
