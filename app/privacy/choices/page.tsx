import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/site";
import OptOutControl from "./OptOutControl";

export const metadata: Metadata = pageMetadata({
  title: "Do Not Sell or Share My Personal Information",
  description: "Opt out of Drive sharing information about your visits with advertising platforms.",
  path: "/privacy/choices",
});

export default function PrivacyChoicesPage() {
  return (
    <main className="container-prose py-12 sm:py-16">
      <p className="eyebrow">Your privacy choices</p>
      <h1 className="type-page mt-4">Do Not Sell or Share My Personal Information</h1>
      <p className="lede mt-4">
        Drive doesn&apos;t sell your personal information. We do use Google Ads&apos; tag to measure which of our
        ads lead to sign-ups, which California law counts as &ldquo;sharing&rdquo; information about your visits
        for advertising. You can turn that off here.
      </p>
      <div className="mt-8">
        <OptOutControl />
      </div>
      <p className="mt-6 text-sm text-fg-secondary">
        Your choice is saved in this browser. Questions or other privacy requests: see our{" "}
        <Link href="/privacy" className="link">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}
