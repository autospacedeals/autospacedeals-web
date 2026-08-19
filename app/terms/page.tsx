import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern use of ${SITE_NAME}.`,
};

const LAST_UPDATED = "August 19, 2026";

export default function TermsOfServicePage() {
  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="mb-3 text-sm font-medium text-blue-400">Legal</p>
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mb-10 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10">
          <Section title="Agreement to Terms">
            <p>
              These Terms of Service govern your use of {SITE_NAME} ({"idriveus.com"}). By
              creating an account or otherwise using the site, you agree to these terms. If you
              don&apos;t agree, please don&apos;t use the site.
            </p>
          </Section>

          <Section title="What Drive Is">
            <p>
              {SITE_NAME} is a listing platform that connects car shoppers with independent
              dealers and brokers advertising lease and finance deals. We don&apos;t own, sell,
              lease, or finance any vehicle, and we&apos;re not a party to any deal made between a
              shopper and a dealer or broker. Every listing, price, term, and incentive is
              provided and controlled by the dealer or broker who posted it.
            </p>
          </Section>

          <Section title="Accounts">
            <p>
              You must be 18 or older to create an account. You&apos;re responsible for keeping
              your login credentials secure and for all activity under your account. Provide
              accurate information when you sign up, and keep it up to date.
            </p>
          </Section>

          <Section title="Dealer & Broker Listings">
            <p>
              Dealers and brokers are solely responsible for the accuracy of their own listings,
              including pricing, terms, incentives, and vehicle details. To help brokers submit
              inventory quickly, {SITE_NAME} offers an AI-assisted tool that reads uploaded
              spreadsheets, pasted text, or screenshots and turns them into draft listings —
              this is a convenience feature only. Every AI-parsed listing lands as a draft that
              the broker must review and confirm before it goes live, and the broker remains fully
              responsible for what they publish.
            </p>
            <p>
              Listings that are repeatedly inaccurate, misleading, or posted in bad faith may be
              edited or removed, and accounts may be suspended.
            </p>
          </Section>

          <Section title="No Financial or Legal Advice">
            <p>
              Payment estimates, incentive calculators, and any guides on the site are provided
              for general informational purposes only. They&apos;re not a financing offer, a
              quote, or financial or legal advice, and actual terms may differ. Always confirm
              final pricing, financing terms, and eligibility for any incentive directly with the
              listing dealer or broker before signing anything.
            </p>
          </Section>

          <Section title="Acceptable Use">
            <p>While using {SITE_NAME}, you agree not to:</p>
            <ul>
              <li>Post false, misleading, or fraudulent listings or information</li>
              <li>Impersonate another person or business</li>
              <li>Scrape, harvest, or systematically extract data from the site</li>
              <li>Upload content you don&apos;t have the right to share</li>
              <li>Harass, threaten, or abuse other users</li>
              <li>Attempt to interfere with or disrupt the site&apos;s normal operation</li>
            </ul>
          </Section>

          <Section title="Content You Submit">
            <p>
              You keep ownership of the content and documents you upload (listing details,
              photos, profile information, and so on). By submitting listing content, you grant
              {" "}
              {SITE_NAME} a license to display, process, and distribute it on the site for the
              purpose of operating the marketplace. Don&apos;t upload anything you don&apos;t have
              the rights to.
            </p>
          </Section>

          <Section title="Third-Party Services">
            <p>
              {SITE_NAME} relies on third-party services to operate, including Vercel (hosting),
              Supabase (database, authentication, and file storage), Anthropic (AI-assisted
              parsing of submitted listing content), and CarsXE (fallback vehicle stock photos).
              We&apos;re not responsible for outages or issues caused by these providers.
            </p>
          </Section>

          <Section title="Disclaimer of Warranties">
            <p>
              {SITE_NAME} is provided "as is" and "as available," without warranties of any kind,
              express or implied. We don&apos;t guarantee that listings are accurate, current, or
              available, or that the site will be uninterrupted or error-free.
            </p>
          </Section>

          <Section title="Limitation of Liability">
            <p>
              To the fullest extent permitted by law, {SITE_NAME} and its founders aren&apos;t
              liable for any indirect, incidental, or consequential damages arising from your use
              of the site or any transaction, deal, or interaction with a dealer or broker you
              connect with through it.
            </p>
          </Section>

          <Section title="Termination">
            <p>
              We may suspend or terminate access to the site for anyone who violates these terms
              or misuses the platform. You may stop using the site or delete your account at any
              time.
            </p>
          </Section>

          <Section title="Governing Law">
            <p>
              These terms are governed by the laws of the State of California, without regard to
              conflict-of-law principles.
            </p>
          </Section>

          <Section title="Changes to These Terms">
            <p>
              We may update these terms as the site evolves. If we make material changes,
              we&apos;ll update the date at the top of this page.
            </p>
          </Section>

          <Section title="Contact Us">
            <p>
              Questions about these terms? Email{" "}
              <a href="mailto:rob@idriveus.com" className="text-white underline">
                rob@idriveus.com
              </a>
              .
            </p>
          </Section>
        </div>
      </section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="mb-4 text-2xl font-semibold">{title}</h2>
      <div className="space-y-4 leading-7 text-zinc-300 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
        {children}
      </div>
    </section>
  );
}
