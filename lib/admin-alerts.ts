// Emails to Drive's admins about things they shouldn't miss — right now,
// a new broker or dealer signing up. Goes to every admin (lib/admin.ts:
// owners + the admins table). SERVER-ONLY. Never throws: a failed alert
// must not break the sign-up it's about.
import { adminEmails } from "@/lib/admin";
import { emailLayoutHtml, escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export interface NewBrokerAlert {
  businessName: string;
  contactName: string;
  sellerType: string;
  dealershipName: string | null;
  email: string;
  phone: string;
  city: string;
  state: string;
}

export async function alertAdminsNewBroker(b: NewBrokerAlert): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const recipients = [...(await adminEmails())];
    const rows: [string, string][] = [
      ["Business", b.businessName],
      ["Contact", b.contactName],
      ["Type", b.dealershipName ? `${b.sellerType} at ${b.dealershipName}` : b.sellerType],
      ["Email", b.email],
      ["Phone", b.phone],
      ["Location", `${b.city}, ${b.state}`],
    ];
    const usersUrl = `${SITE_URL}/admin/users`;
    const html = emailLayoutHtml({
      preheader: `${b.businessName} (${b.city}, ${b.state}) just created a broker account.`,
      heading: "New broker sign-up",
      bodyHtml: `${rows
        .map(([k, v]) => `<p style="margin:0 0 8px 0;"><strong>${k}:</strong> ${escapeHtml(v)}</p>`)
        .join("")}
<p style="margin:16px 0 0 0;"><a href="${usersUrl}">See all users</a></p>`,
      footerHtml: "You're getting this because you're a Drive admin.",
    });
    const text = `New broker sign-up\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nSee all users: ${usersUrl}`;
    await Promise.all(
      recipients.map(async (to) => {
        const sent = await sendEmail({
          to,
          replyTo: b.email,
          subject: `New broker: ${b.businessName} (${b.city}, ${b.state})`,
          html,
          text,
        });
        if (!sent.ok) console.error(`new-broker alert to ${to} failed:`, sent.error);
      })
    );
  } catch (err) {
    console.error("new-broker alert threw:", err);
  }
}
