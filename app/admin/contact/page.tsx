import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Contact messages", robots: { index: false } };
export const dynamic = "force-dynamic";

interface ContactMessage {
  id: string;
  name: string | null;
  email: string;
  topic: string;
  message: string;
  emailed: boolean;
  created_at: string;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
}

// Everything sent through the "Contact support" form, newest first. Each
// message is emailed too; this is the record if that email got filtered.
export default async function AdminContactPage() {
  await requireAdmin("/admin/contact");
  const { data, error } = await createAdminClient()
    .from("contact_messages")
    .select("id, name, email, topic, message, emailed, created_at")
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<ContactMessage[]>();
  if (error) console.error("admin contact: load failed:", error.message);
  const messages = data ?? [];

  return (
    <main className="container-page max-w-3xl py-8 sm:py-10">
      <h1 className="type-page text-3xl">Contact messages</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {`${messages.length} message${messages.length === 1 ? "" : "s"} from the Contact support form · newest first. Click an email address to reply.`}
      </p>

      {error ? (
        <p className="alert alert-danger mt-6">Couldn&apos;t load contact messages right now.</p>
      ) : messages.length === 0 ? (
        <p className="mt-6 text-sm text-fg-muted">None yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {messages.map((m) => (
            <li key={m.id} className="panel">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium text-fg">
                  {m.name ? `${m.name} · ` : ""}
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic}`)}`}
                    className="link break-all"
                  >
                    {m.email}
                  </a>
                </p>
                <p className="text-xs text-fg-muted">{when(m.created_at)}</p>
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                {m.topic}
                {!m.emailed && <span className="text-warning"> · email didn&apos;t send</span>}
              </p>
              <p className="mt-3 text-sm whitespace-pre-wrap text-fg-secondary">{m.message}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
