import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { READER_EMAIL, isReaderConfigured, readerStatus } from "@/lib/google-reader";
import CheckSheet from "./CheckSheet";

export const metadata: Metadata = { title: "Sheets reader", robots: { index: false } };
export const dynamic = "force-dynamic";

// Connects the Google account brokers share private sheets with. Done once;
// reconnect only if Google ever disconnects it (e.g. its password changes).
export default async function GoogleReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireAdmin("/admin/google-reader");
  const { connected, error } = await searchParams;
  const status = await readerStatus();
  const configured = isReaderConfigured();

  return (
    <main className="container-page max-w-2xl py-8 sm:py-10">
      <h1 className="type-page text-3xl">Sheets reader</h1>
      <p className="mt-2 text-sm text-fg-secondary">
        Brokers with a private Google Sheet share it (view-only) with{" "}
        <span className="font-medium text-fg">{READER_EMAIL}</span>. Connect that Google account here once so
        the site can read the sheets shared with it.
      </p>

      {connected && <p className="alert alert-success mt-5">Connected — brokers now share with {READER_EMAIL}.</p>}
      {error && <p className="alert alert-danger mt-5">{error}</p>}

      <div className="panel mt-6">
        {status ? (
          <p className="text-sm text-fg">
            Connected as <span className="font-medium">{status.email}</span> on{" "}
            {new Date(status.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
          </p>
        ) : (
          <p className="text-sm text-fg-secondary">Not connected yet — brokers are shown the technical backup address until it is.</p>
        )}
        {configured ? (
          <a href="/api/google-reader/start" className="btn btn-primary mt-4">
            {status ? "Reconnect" : "Connect"} {READER_EMAIL}
          </a>
        ) : (
          <p className="alert alert-warning mt-4">GOOGLE_OAUTH_CLIENT_SECRET isn&apos;t set in Vercel yet.</p>
        )}
        <p className="mt-3 text-xs text-fg-muted">
          Sign in as {READER_EMAIL} when Google asks. Google may say it hasn&apos;t verified this request — that&apos;s
          expected for this internal account: choose Advanced → Continue.
        </p>
      </div>

      <CheckSheet />
    </main>
  );
}
