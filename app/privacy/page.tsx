import type { Metadata } from "next";
import { SITE_NAME, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    `How ${SITE_NAME} collects, uses, and protects your information.`,
  path: "/privacy",
});

const LAST_UPDATED = "October 4, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main>
      <header className="container-prose pt-12 pb-8 sm:pt-16">
        <p className="eyebrow">Legal</p>
        <h1 className="type-page mt-4">Privacy Policy</h1>
        <p className="label mt-3">Last updated: {LAST_UPDATED}</p>
      </header>

      <div className="container-prose pb-16">
        <div className="mt-10">
          <Section title="Overview">
            <p>
              {SITE_NAME} ({"idriveus.com"}, &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is a marketplace that connects
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
              <strong>Account information.</strong> If you create a
              customer account, we collect your first and last name, zip code, email address, and
              phone number (required), and optionally your address, current vehicle, and photos of your
              driver&apos;s license and insurance or AAA card. If you create a dealer/broker
              account, we collect your business name, contact name, phone number, city/state, and
              email address.
            </p>
            <p>
              <strong>Signing in with Google.</strong> If you choose
              &quot;Continue with Google,&quot; Google shares your name, email address, and profile
              picture with us (the basic &quot;openid,&quot; &quot;email,&quot; and &quot;profile&quot;
              permissions). We use your name and email only to create and sign you in to your{" "}
              {SITE_NAME} account and to email you about it; we don&apos;t use the profile picture.
              We don&apos;t get access to your Gmail, contacts, files, or anything else in your
              Google account, we don&apos;t sell or share this information for advertising, and we
              don&apos;t use it to train AI models. You can remove {SITE_NAME}&apos;s access at any
              time from your Google Account&apos;s security settings (Third-party apps &amp; services).
            </p>
            <p>
              <strong>Activity on the site.</strong> If you have an account,
              we keep the deals you save, the searches you save for alerts, and any reviews you
              write about a dealer or broker. Reviews are public: they appear on that dealer or
              broker&apos;s profile with your first name.
            </p>
            <p>
              <strong>Location.</strong> If you use &quot;Closest to my
              location,&quot; your browser asks permission to share your approximate location.
              It&apos;s used only in your browser to sort deals by state — we don&apos;t store it or
              send it to our servers.
            </p>
            <p>
              <strong>Listing content.</strong> Dealers and brokers submit
              vehicle listing details — pricing, terms, photos, and descriptions — either directly
              or by uploading a spreadsheet, pasting text, or uploading a screenshot of their
              inventory.
            </p>
            <p>
              <strong>Messages.</strong> Shoppers and dealers/brokers talk to
              each other through {SITE_NAME}&apos;s messaging. We store every message (who sent it,
              when, and what it says) so there&apos;s a record of each conversation, and we may
              review conversations to resolve disputes, prevent fraud or abuse, and keep the
              marketplace working well. Only the two people in a conversation and {SITE_NAME} can
              read it (at {SITE_NAME}, that means a small number of team members with admin
              access). If you turn on message emails, we also email you new messages. If you email
              us or use our contact form, we receive whatever you send.
            </p>
            <p>
              <strong>Text messages.</strong> If you turn on &quot;Text me new
              messages,&quot; we use the mobile number you confirm only to text you when you get a
              new message on {SITE_NAME} and to receive your replies, which we add to the
              conversation. We send texts through our provider, Twilio. We do not sell or share
              your SMS opt-in data or personal information with third parties for marketing
              purposes. No mobile information will be shared with third parties or affiliates for
              marketing or promotional purposes; text messaging opt-in data and consent are never
              shared with anyone. Reply STOP to stop texts at any time. More about {SITE_NAME}
              text alerts: idriveus.com/text-alerts.
            </p>
            <p>
              <strong>Automatically collected information.</strong> Like
              most websites, our hosting provider logs standard technical information (IP
              address, browser type, pages visited) for security and reliability. We use a small
              number of essential cookies to keep you signed in, plus two first-party cookies of our
              own: a random visitor ID and a note of how you found us (for example, which ad or
              website sent you). We use them, along with your approximate city and state (looked up
              from your IP address by our hosting provider; we don&apos;t store the address
              itself), to count visits and listing views, see which areas they come from, and
              learn which ads lead to conversations with sellers. That information stays with {SITE_NAME}; it isn&apos;t
              shared with ad platforms. We don&apos;t use advertising or cross-site tracking cookies,
              and we don&apos;t run third-party analytics on the site today. If we ever add advertising or measurement tools (for example, an ad
              platform&apos;s tracking pixel), we&apos;ll update this policy first and give you a
              way to opt out of any &quot;sale&quot; or &quot;sharing&quot; of your information
              before they&apos;re used.
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
              <li>
                To communicate with you about your account or a listing, and to send emails you ask
                for — deals similar to one you&apos;re viewing, or alerts for new deals that match a
                search you saved (every alert email has a link to stop them)
              </li>
              <li>To keep the site secure and prevent fraud or abuse</li>
              <li>To improve and maintain the site</li>
            </ul>
            <p>
              Driver&apos;s license and insurance/AAA card photos, if you choose to upload them,
              are &quot;sensitive personal information&quot; under California law. We use them only
              to help verify who you are; they&apos;re stored privately, aren&apos;t shared with
              dealers/brokers or shown publicly, and aren&apos;t used to infer anything about you.
              Your account password is handled by our authentication provider and we never see it.
            </p>
          </Section>

          <Section title="How We Share Information">
            <p>We don&apos;t sell your personal information. We share it only:</p>
            <ul>
              <li>
                <strong>With service providers</strong> who host our
                infrastructure and help the site function — currently Supabase (database,
                authentication, and file storage), Vercel (hosting), Resend (sending the site&apos;s
                emails), Twilio (text message alerts and sign-up codes, only if you turn texts on), Google (the optional &quot;Continue with Google&quot; sign-in), Anthropic (AI processing of
                submitted spreadsheets/text/screenshots into listing data), and CarsXE (vehicle
                stock photo lookups by year/make/model — no personal information is sent to
                CarsXE)
              </li>
              <li>
                <strong>With the other person in a conversation</strong> — when
                you message about a listing, the other side sees your messages and your display name
                (a shopper&apos;s first name and last initial, or a dealer/broker&apos;s business
                name). Phone numbers and email addresses aren&apos;t shown to them unless you share
                them in a message. A dealer/broker&apos;s business name and city/state are shown
                publicly on their listings and profile.
              </li>
              <li>
                <strong>If required by law</strong> — to comply with legal
                process, or to protect the rights, property, or safety of {SITE_NAME}, our users,
                or others
              </li>
              <li>
                <strong>In a business transfer</strong> — if {SITE_NAME}{" "}
                is ever involved in a merger, acquisition, or sale of assets, your information may
                transfer as part of that
              </li>
            </ul>
          </Section>

          <Section title="Categories of Information (California Notice)">
            <p>
              California law asks us to describe what we collect in its terms. In the last 12
              months we have collected: <strong>identifiers</strong> (name, email, phone, account
              ID); <strong>customer records</strong> (zip code, address, current vehicle, if you
              give them); <strong>commercial information</strong> (deals you save or ask about, and
              your messages); <strong>internet activity</strong> (basic server logs);
              <strong> sensitive personal information</strong> (driver&apos;s license and
              insurance/AAA card photos if you upload them, and your account login); and, for
              dealers/brokers, <strong>professional information</strong> (business name, role,
              dealership). We get this information from you, from Google if you sign in with it,
              and from dealers/brokers&apos; own listings. We use it only for the purposes above
              and share it only as described above. We have not sold or shared personal
              information for cross-context behavioral advertising, and we don&apos;t knowingly
              collect information from anyone under 18.
            </p>
          </Section>

          <Section title="Data Retention & Security">
            <p>
              We keep account information for as long as your account is active. Messages are kept
              as long as either person in the conversation still has an account, so the record
              stays complete for both sides, and we may keep information longer when needed to
              resolve a dispute, prevent fraud, or meet a legal obligation. Server logs are kept
              for a short time by our hosting provider. You can ask us to delete your account and
              associated data at any time by emailing us (see below); messages you sent may remain
              visible to the other person in that conversation.
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
              on that front today. If your browser sends a Global Privacy Control signal, we treat
              it as a request to opt out of any future sale or sharing. California residents may
              also ask what personal information we&apos;ve disclosed to others for their direct
              marketing purposes (we don&apos;t do this).
            </p>
            <p>
              To exercise any of these rights, or if you&apos;re in another state with similar
              privacy protections, email{" "}
              <a href="mailto:rob@idriveus.com" className="link">
                rob@idriveus.com
              </a>{" "}
              or use our{" "}
              <a href="/contact" className="link">
                contact form
              </a>
              . We&apos;ll confirm your identity (usually by replying to the email on your account)
              before acting on a request, respond within 45 days, and won&apos;t discriminate
              against you for exercising these rights. You can use an authorized agent to make a
              request for you.
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
              <a href="mailto:rob@idriveus.com" className="link">
                rob@idriveus.com
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-10">
      <h2 className="type-section text-2xl sm:text-2xl">{title}</h2>
      <div className="prose-drive mt-4">{children}</div>
    </section>
  );
}
