import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE_NAME} collects, uses, and protects your information.`,
};

const LAST_UPDATED = "August 19, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main>
      <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="mb-3 text-sm font-medium text-blue-400">Legal</p>
        <h1 className="mb-2 text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mb-10 text-sm text-zinc-500">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10">
          <Section title="Overview">
            <p>
              {SITE_NAME} ({"idriveus.com"}, "we," "us," or "our") is a marketplace that connects
              car shoppers with dealers and brokers listing lease and finance deals. This policy
              explains what information we collect from customers and dealers/brokers who use the
              site, how we use it, and the choices you have.
            </p>
            <p>
              This policy isn&apos;t a substitute for legal advice, and we&apos;re not a law
              firm — if you have specific legal questions about your own rights, talk to an
              attorney.
            </p>
          </Section>

          <Section title="Information We Collect">
            <p>
              <strong className="text-white">Account information.</strong> If you create a
              customer account, we collect your first and last name, zip code, and email address
              (required), and optionally your address, current vehicle, and photos of your
              driver&apos;s license and insurance or AAA card. If you create a dealer/broker
              account, we collect your business name, contact name, phone number, city/state, and
              email address.
            </p>
            <p>
              <strong className="text-white">Listing content.</strong> Dealers and brokers submit
              vehicle listing details — pricing, terms, photos, and descriptions — either directly
              or by uploading a spreadsheet, pasting text, or uploading a screenshot of their
              inventory.
            </p>
            <p>
              <strong className="text-white">Communications.</strong> If you email us or contact
              a dealer/broker through the site, we (and they) receive whatever you send.
            </p>
            <p>
              <strong className="text-white">Automatically collected information.</strong> Like
              most websites, our hosting provider logs standard technical information (IP
              address, browser type, pages visited) for security and reliability. We use a small
              number of essential cookies to keep you signed in — we don&apos;t use advertising or
              cross-site tracking cookies, and we don&apos;t run third-party analytics on the site
              today.
            </p>
          </Section>

          <Section title="How We Use Information">
            <ul>
              <li>To create and manage your account and show you your saved information</li>
              <li>To display dealer/broker listings to shoppers and connect the two directly</li>
              <li>
                To read and structure spreadsheets, pasted text, and screenshots that dealers/
                brokers submit, using an AI service, so their inventory can be turned into
                listings for their review
              </li>
              <li>
                To look up a stock photo of a vehicle by year/make/model when a dealer/broker
                hasn&apos;t uploaded their own photo
              </li>
              <li>To communicate with you about your account or a listing</li>
              <li>To keep the site secure and prevent fraud or abuse</li>
              <li>To improve and maintain the site</li>
            </ul>
            <p>
              Driver&apos;s license and insurance/AAA card photos, if you choose to upload them,
              are used only to help verify who you are and aren&apos;t shared with dealers/
              brokers or shown publicly.
            </p>
          </Section>

          <Section title="How We Share Information">
            <p>We don&apos;t sell your personal information. We share it only:</p>
            <ul>
              <li>
                <strong className="text-white">With service providers</strong> who host our
                infrastructure and help the site function — currently Supabase (database,
                authentication, and file storage), Vercel (hosting), Anthropic (AI processing of
                submitted spreadsheets/text/screenshots into listing data), and CarsXE (vehicle
                stock photo lookups by year/make/model — no personal information is sent to
                CarsXE)
              </li>
              <li>
                <strong className="text-white">With the dealer/broker you contact</strong> — if
                you reach out about a listing, we and the dealer/broker exchange whatever contact
                information is needed for that conversation. A dealer/broker&apos;s business name,
                city/state, and phone number are shown publicly on their listings and profile.
              </li>
              <li>
                <strong className="text-white">If required by law</strong> — to comply with legal
                process, or to protect the rights, property, or safety of {SITE_NAME}, our users,
                or others
              </li>
              <li>
                <strong className="text-white">In a business transfer</strong> — if {SITE_NAME}{" "}
                is ever involved in a merger, acquisition, or sale of assets, your information may
                transfer as part of that
              </li>
            </ul>
          </Section>

          <Section title="Data Retention & Security">
            <p>
              We keep your information for as long as your account is active, or as long as we
              need it for the purposes described above. You can ask us to delete your account and
              associated data at any time by emailing us (see below).
            </p>
            <p>
              We rely on our infrastructure providers&apos; security practices (encryption in
              transit, access controls limiting data to your own account) to protect your
              information, but no system is perfectly secure, and we can&apos;t guarantee absolute
              security.
            </p>
          </Section>

          <Section title="Your Privacy Choices">
            <p>
              If you&apos;re a California resident, state privacy law (the CCPA/CPRA) gives you
              the right to know what personal information we&apos;ve collected about you, request
              a copy of it, ask us to correct or delete it, and opt out of the sale or sharing of
              it for cross-context advertising. We don&apos;t sell personal information or share
              it for cross-context behavioral advertising, so there&apos;s nothing to opt out of
              on that front today.
            </p>
            <p>
              To exercise any of these rights, or if you&apos;re in another state with similar
              privacy protections, email{" "}
              <a href="mailto:rob@idriveus.com" className="text-white underline">
                rob@idriveus.com
              </a>
              . We won&apos;t discriminate against you for exercising these rights.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              {SITE_NAME} is intended for adults 18 and older. We don&apos;t knowingly collect
              information from anyone under 18. If you believe a minor has provided us
              information, contact us and we&apos;ll delete it.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this policy as the site changes. If we make material changes,
              we&apos;ll update the date at the top of this page.
            </p>
          </Section>

          <Section title="Contact Us">
            <p>
              Questions about this policy or your information? Email{" "}
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
