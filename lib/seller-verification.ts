// New brokers and dealership salespeople start unverified: their listings
// stay hidden until an admin checks the DMV license they gave at sign-up
// and approves them (supabase/migrations/0038_seller_verification.sql).
// SERVER-ONLY.
import { emailLayoutHtml, escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

// California DMV's public license lookup. It covers dealers (an autobroker
// is a dealer with an autobroker endorsement), not individual salespeople:
// for those, look up the dealership and confirm they work there.
export const DMV_LICENSE_LOOKUP_URL =
  "https://www.dmv.ca.gov/portal/vehicle-industry-services/occupational-licensing/occupational-license-lookup/";

export function verificationSteps(sellerType: string): string {
  return sellerType === "Salesperson"
    ? "Look up the dealership on the DMV lookup, then confirm they work there (call the dealership's listed number, or check for an email at the dealership's domain)."
    : "Look up the dealer license on the DMV lookup: it should be active, carry the autobroker endorsement, and match their name or business. Then text or call the phone number listed publicly for that business.";
}

// "You're verified": sent to the seller when an admin approves them.
export async function emailSellerApproved(to: string, name: string, liveListings: number): Promise<void> {
  if (!isEmailConfigured() || !to) return;
  try {
    const dashboardUrl = `${SITE_URL}/broker/dashboard`;
    const live =
      liveListings > 0
        ? `Your ${liveListings} listing${liveListings === 1 ? " is" : "s are"} now live for shoppers.`
        : "Anything you post now goes live right away.";
    const html = emailLayoutHtml({
      preheader: "Your Drive account is verified.",
      heading: "You're verified",
      bodyHtml:
        `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)}, we checked your license and your Drive account is verified. ${escapeHtml(live)}</p>` +
        `<p style="margin:0;"><a href="${dashboardUrl}">Go to your dashboard</a></p>`,
      footerHtml: "You're getting this because you signed up to list cars on Drive.",
    });
    const text = `Hi ${name}, we checked your license and your Drive account is verified. ${live}\n\nYour dashboard: ${dashboardUrl}`;
    const sent = await sendEmail({ to, subject: "You're verified on Drive", html, text });
    if (!sent.ok) console.error("seller-approved email failed:", sent.error);
  } catch (err) {
    console.error("seller-approved email threw:", err);
  }
}
