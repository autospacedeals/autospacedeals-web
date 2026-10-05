import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { OUTCOMES_ENABLED, OUTCOME_LABELS, isLeadOutcome, isValidOutcomeToken } from "@/lib/leads";
import { confirmLeadOutcomeAction } from "./actions";

export const metadata: Metadata = { title: "Update a lead", robots: { index: false } };
export const dynamic = "force-dynamic";

// Landing page for the check-in email's "Sold / Still working / Didn't buy"
// links. Saving takes one tap on the button rather than happening on page
// load, because email security scanners open every link in an email.
export default async function LeadOutcomePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; o?: string; t?: string; saved?: string; error?: string }>;
}) {
  const { c = "", o = "", t = "", saved, error } = await searchParams;

  let body: React.ReactNode;
  if (saved && isLeadOutcome(saved)) {
    body = (
      <>
        <h1 className="type-title">Saved: {OUTCOME_LABELS[saved]}</h1>
        <p className="mt-2 text-fg-secondary">Thanks — that&apos;s all we needed. You can close this page.</p>
      </>
    );
  } else if (!OUTCOMES_ENABLED || error || !/^[0-9a-f-]{36}$/i.test(c) || !isLeadOutcome(o) || !isValidOutcomeToken(c, o, t)) {
    body = (
      <>
        <h1 className="type-title">This link doesn&apos;t work</h1>
        <p className="mt-2 text-fg-secondary">
          Open the conversation in your{" "}
          <Link href="/broker/dashboard/messages" className="link">
            Drive messages
          </Link>{" "}
          and pick an answer there instead.
        </p>
      </>
    );
  } else {
    const { data: conv } = await createAdminClient()
      .from("conversations")
      .select("deal_label, outcome")
      .eq("id", c)
      .maybeSingle<{ deal_label: string; outcome: string | null }>();
    body = (
      <>
        <h1 className="type-title">Mark this lead as &ldquo;{OUTCOME_LABELS[o]}&rdquo;?</h1>
        {conv?.deal_label && <p className="mt-2 text-fg-secondary">The {conv.deal_label} conversation.</p>}
        {conv?.outcome && isLeadOutcome(conv.outcome) && conv.outcome !== o && (
          <p className="mt-1 text-sm text-fg-muted">It&apos;s marked {OUTCOME_LABELS[conv.outcome]} right now.</p>
        )}
        <form action={confirmLeadOutcomeAction} className="mt-6">
          <input type="hidden" name="c" value={c} />
          <input type="hidden" name="o" value={o} />
          <input type="hidden" name="t" value={t} />
          <button type="submit" className="btn btn-primary">
            Yes, mark it {OUTCOME_LABELS[o]}
          </button>
        </form>
        <p className="mt-4 text-xs text-fg-muted">Only Drive sees this. It helps us send you more buyers like this one.</p>
      </>
    );
  }

  return (
    <main className="container-page max-w-xl py-16 sm:py-20">
      <div className="panel">{body}</div>
    </main>
  );
}
