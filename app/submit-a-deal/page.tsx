import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import SubmitDealForm from "@/components/SubmitDealForm";

export const metadata: Metadata = {
  title: "Submit a Deal",
  description:
    "Dealers and brokers: submit a lease or finance deal for review before it's posted on Drive.",
};

export default function SubmitADealPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-zinc-400 transition hover:text-white"
      >
        <ArrowLeft size={16} /> Back to all deals
      </Link>

      <p className="mb-3 text-sm font-medium text-blue-400">For Dealers &amp; Brokers</p>
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Submit a Deal</h1>
      <p className="mt-3 max-w-2xl leading-7 text-zinc-400">
        Fill out the details below and hit send — it opens a pre-filled email straight to our
        team. We review every submission before it goes live, then reach out to confirm details
        and get real photos before it&apos;s posted.
      </p>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-zinc-400">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-400" />
        <p>
          Nothing is posted automatically. This just gets your deal in front of us fast — we
          &apos;ll follow up by phone or email to verify it before it appears on Drive.
        </p>
      </div>

      <SubmitDealForm />
    </main>
  );
}
