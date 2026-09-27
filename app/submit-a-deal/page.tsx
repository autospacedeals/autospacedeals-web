import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import SubmitDealForm from "@/components/SubmitDealForm";

export const metadata: Metadata = {
  title: "Submit a Deal",
  description:
    "Dealers and brokers: submit a lease deal for review before it's posted on Drive.",
};

export default function SubmitADealPage() {
  return (
    <main className="container-prose py-8 sm:py-12">
      <Link href="/" className="link-arrow mb-6 min-h-9">
        <ArrowLeft /> Back to all deals
      </Link>

      <header>
        <p className="eyebrow">For dealers &amp; brokers</p>
        <h1 className="type-page mt-4 text-3xl sm:text-4xl">Submit a deal</h1>
        <p className="lede mt-4 max-w-2xl">
          Fill out the details below and hit send — it opens a pre-filled email straight to our
          team. We review every submission before it goes live, then reach out to confirm details
          and get real photos before it&apos;s posted.
        </p>
      </header>

      <div className="card mt-6 flex items-start gap-3 p-5 text-sm leading-6 text-fg-secondary">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-success" />
        <p>
          Nothing is posted automatically. This just gets your deal in front of us fast —
          we&apos;ll follow up by phone or email to verify it before it appears on Drive.
        </p>
      </div>

      <SubmitDealForm />
    </main>
  );
}
