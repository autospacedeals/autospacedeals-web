import type { Metadata } from "next";
import ContactForm from "./ContactForm";
import { createClient } from "@/lib/supabase/server";
import { SITE_NAME, SITE_URL, pageMetadata } from "@/lib/site";
import { jsonLdScript } from "@/lib/lease-pages";
import Wordmark from "@/components/Wordmark";

export const metadata: Metadata = pageMetadata({
  title: "Contact Support",
  description: "Contact Drive about a deal, your account, or listing your lease deals. Email rob@idriveus.com or send a message; we reply by email.",
  path: "/contact",
});

// ?topic=dealer or ?topic=listing preselects the topic (e.g. the footer's
// "List your deals" link).
const TOPIC_PARAMS: Record<string, string> = {
  dealer: "Dealer or broker account",
  listing: "A listing",
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const defaultTopic = (topic && TOPIC_PARAMS[topic]) || undefined;
  // Signed-in visitors don't have to type their email.
  let email = "";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? "";
  } catch (err) {
    console.error("contact page: getUser failed:", err);
  }

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "ContactPage",
            url: `${SITE_URL}/contact`,
            name: `Contact ${SITE_NAME}`,
            mainEntity: {
              "@type": "Organization",
              name: SITE_NAME,
              url: SITE_URL,
              email: "rob@idriveus.com",
              contactPoint: [
                { "@type": "ContactPoint", contactType: "customer support", email: "rob@idriveus.com", availableLanguage: "English" },
                { "@type": "ContactPoint", contactType: "sales", name: "List your deals on Drive", email: "rob@idriveus.com" },
              ],
            },
          }),
        }}
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel border-rule-ink p-8 sm:p-10">
          <Wordmark className="text-xl text-fg" />
          <p className="label mt-6">Support</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Contact us</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Questions about a deal, your account, or listing your inventory? Send us a message and
            we&apos;ll reply by email, or write to{" "}
            <a href="mailto:rob@idriveus.com" className="link">
              rob@idriveus.com
            </a>
            .
          </p>
          <div className="mt-8">
            <ContactForm defaultEmail={email} defaultTopic={defaultTopic} />
          </div>
        </div>
      </div>
    </main>
  );
}
