// Emails to Drive's admins about things they shouldn't miss — right now,
// a new broker or dealer signing up, their first car going live, a synced
// sheet that needs a look, or a broker deleting their account.
// Goes to every admin (lib/admin.ts: owners + the admins table).
// SERVER-ONLY. Never throws: a failed alert must not break what it's about.
import { adminEmails } from "@/lib/admin";
import { emailLayoutHtml, escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/deal-utils";

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

export interface AccountDeletedAlert {
  businessName: string;
  email: string;
  city: string;
  state: string;
  listings: number;
}

// A broker deleted their own account (app/account/actions.ts) — their
// listings came down with it.
export async function alertAdminsAccountDeleted(b: AccountDeletedAlert): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const recipients = [...(await adminEmails())];
    const listings = `${b.listings} listing${b.listings === 1 ? "" : "s"} taken down`;
    const html = emailLayoutHtml({
      preheader: `${b.businessName} deleted their Drive account.`,
      heading: "A broker deleted their account",
      bodyHtml:
        `<p style="margin:0 0 8px 0;"><strong>Business:</strong> ${escapeHtml(b.businessName)}</p>` +
        `<p style="margin:0 0 8px 0;"><strong>Email:</strong> ${escapeHtml(b.email)}</p>` +
        `<p style="margin:0 0 8px 0;"><strong>Location:</strong> ${escapeHtml(`${b.city}, ${b.state}`)}</p>` +
        `<p style="margin:0;">${escapeHtml(listings)}.</p>`,
      footerHtml: "You're getting this because you're a Drive admin.",
    });
    const text = `${b.businessName} (${b.email}, ${b.city}, ${b.state}) deleted their Drive account. ${listings}.`;
    await Promise.all(
      recipients.map(async (to) => {
        const sent = await sendEmail({
          to,
          replyTo: b.email || undefined,
          subject: `Broker deleted account: ${b.businessName}`,
          html,
          text,
        });
        if (!sent.ok) console.error(`account-deleted alert to ${to} failed:`, sent.error);
      })
    );
  } catch (err) {
    console.error("account-deleted alert threw:", err);
  }
}

const SOURCE_LABELS: Record<string, string> = {
  google_sheet: "Google Sheet",
  excel_file: "File upload",
  free_text: "Pasted text",
  screenshot: "Screenshot",
  link: "Link",
  manual: "Typed in by hand",
};

// A broker's first car just went live. Call after anything that publishes
// a broker's listings; only the first call for each broker sends
// (brokers.first_listing_at, supabase/migrations/0037_first_listing_alert.sql).
export async function alertAdminsFirstListing(brokerId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: live } = await admin
      .from("deals")
      .select("year, make, model, trim, payment, one_pay, due_at_signing, sheet_sync_id, submission_id, slug")
      .eq("broker_id", brokerId)
      .eq("status", "published")
      .order("created_at", { ascending: true })
      .returns<
        {
          year: number;
          make: string;
          model: string;
          trim: string | null;
          payment: number;
          one_pay: boolean;
          due_at_signing: number;
          sheet_sync_id: string | null;
          submission_id: string | null;
          slug: string;
        }[]
      >();
    if (!live?.length) return;

    // Claim it: only one caller ever gets the row back.
    const { data: broker } = await admin
      .from("brokers")
      .update({ first_listing_at: new Date().toISOString() })
      .eq("id", brokerId)
      .is("first_listing_at", null)
      .select("business_name, contact_name, contact_phone, seller_type, dealership_name, city, state")
      .maybeSingle<{
        business_name: string;
        contact_name: string | null;
        contact_phone: string | null;
        seller_type: string;
        dealership_name: string | null;
        city: string;
        state: string;
      }>();
    if (!broker || !isEmailConfigured()) return;
    const email = (await admin.auth.admin.getUserById(brokerId)).data.user?.email ?? null;

    // How the cars got on the site.
    const submissionIds = [...new Set(live.map((d) => d.submission_id).filter((id): id is string => Boolean(id)))];
    const { data: subs } = submissionIds.length
      ? await admin.from("submissions").select("id, source_type").in("id", submissionIds).returns<{ id: string; source_type: string }[]>()
      : { data: [] as { id: string; source_type: string }[] };
    const sourceOf = (d: (typeof live)[number]) => {
      if (d.sheet_sync_id) return "Connected Google Sheet";
      const type = subs?.find((s) => s.id === d.submission_id)?.source_type;
      return type ? (SOURCE_LABELS[type] ?? type) : "Typed in by hand";
    };
    const methods = [...new Set(live.map(sourceOf))].join(", ");

    const name = broker.business_name;
    const count = `${live.length} car${live.length === 1 ? "" : "s"}`;
    const cars = live.slice(0, 8).map((d) => {
      const car = [d.year, d.make, d.model, d.trim].filter(Boolean).join(" ");
      const price = d.one_pay ? `${formatCurrency(d.due_at_signing)} one-pay` : `${formatCurrency(d.payment)}/mo`;
      return { car, price, url: `${SITE_URL}/deals/${d.slug}` };
    });
    const more = live.length > cars.length ? `…and ${live.length - cars.length} more` : "";
    const rows: [string, string][] = [
      ["Seller", broker.dealership_name ? `${name} (${broker.seller_type} at ${broker.dealership_name})` : `${name} (${broker.seller_type})`],
      ["Contact", [broker.contact_name, email, broker.contact_phone].filter(Boolean).join(" · ")],
      ["Location", `${broker.city}, ${broker.state}`],
      ["Posted with", methods],
    ];
    const pageUrl = `${SITE_URL}/brokers/${brokerId}`;
    const html = emailLayoutHtml({
      preheader: `${name} just put ${count} live on Drive.`,
      heading: `${name} posted their first ${live.length === 1 ? "car" : "cars"}`,
      bodyHtml:
        rows.map(([k, v]) => `<p style="margin:0 0 8px 0;"><strong>${k}:</strong> ${escapeHtml(v)}</p>`).join("") +
        `<p style="margin:16px 0 8px 0;"><strong>${escapeHtml(count)} live:</strong></p>` +
        cars
          .map((c) => `<p style="margin:0 0 6px 0;"><a href="${c.url}">${escapeHtml(c.car)}</a> — ${escapeHtml(c.price)}</p>`)
          .join("") +
        (more ? `<p style="margin:0 0 6px 0;">${escapeHtml(more)}</p>` : "") +
        `<p style="margin:16px 0 0 0;"><a href="${pageUrl}">See their page</a></p>`,
      footerHtml: "You're getting this because you're a Drive admin. Sent once per seller, on their first listing.",
    });
    const text =
      `${name} posted their first ${count} on Drive.\n\n` +
      rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\n${cars.map((c) => `${c.car} — ${c.price}\n${c.url}`).join("\n")}${more ? `\n${more}` : ""}\n\nTheir page: ${pageUrl}`;
    const recipients = [...(await adminEmails())];
    await Promise.all(
      recipients.map(async (to) => {
        const sent = await sendEmail({
          to,
          replyTo: email || undefined,
          subject: `First listing: ${name} posted ${count}`,
          html,
          text,
        });
        if (!sent.ok) console.error(`first-listing alert to ${to} failed:`, sent.error);
      })
    );
  } catch (err) {
    console.error("first-listing alert threw:", err);
  }
}

export interface SheetIssuesAlert {
  brokerId: string;
  businessName: string;
  sheetUrl: string;
  // Cars that vanished from the sheet all at once and weren't removed.
  heldBack: string[];
  // Rows the AI couldn't read.
  skipped: { tab: string | null; row: number; reason: string }[];
  // Tabs added to the sheet; they start switched off.
  newTabs: string[];
}

// A synced Google Sheet needs a look (lib/sheet-sync.ts). Sent when the set
// of problems changes, not on every check.
export async function alertAdminsSheetIssues(a: SheetIssuesAlert): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const sections: { title: string; note: string; items: string[] }[] = [];
    if (a.heldBack.length > 0) {
      sections.push({
        title: `${a.heldBack.length} car${a.heldBack.length === 1 ? "" : "s"} not removed`,
        note: "They disappeared from the sheet all at once, which usually means a bad read (sheet unshared, tab renamed or emptied). They stay live until the sheet is fixed. If they really sold, remove them on Admin → Listings.",
        items: a.heldBack,
      });
    }
    if (a.skipped.length > 0) {
      sections.push({
        title: `${a.skipped.length} row${a.skipped.length === 1 ? "" : "s"} couldn't be read`,
        note: "These rows aren't posted. Usually a missing payment, model or term on the sheet.",
        items: a.skipped.map((r) => `${r.tab ? `${r.tab}, ` : ""}row ${r.row}: ${r.reason}`),
      });
    }
    if (a.newTabs.length > 0) {
      sections.push({
        title: `New tab${a.newTabs.length === 1 ? "" : "s"} found, left off`,
        note: "New tabs start switched off. The seller can turn them on in their dashboard.",
        items: a.newTabs,
      });
    }
    if (sections.length === 0) return;

    const listingsUrl = `${SITE_URL}/admin/listings`;
    const shown = (items: string[]) => items.slice(0, 25);
    const html = emailLayoutHtml({
      preheader: `${a.businessName}'s sheet: ${sections.map((s) => s.title).join(", ")}.`,
      heading: `${a.businessName}'s sheet needs a look`,
      bodyHtml:
        sections
          .map(
            (s) =>
              `<p style="margin:16px 0 4px 0;"><strong>${escapeHtml(s.title)}</strong></p>` +
              `<p style="margin:0 0 6px 0;">${escapeHtml(s.note)}</p>` +
              shown(s.items).map((i) => `<p style="margin:0 0 4px 0;">• ${escapeHtml(i)}</p>`).join("") +
              (s.items.length > 25 ? `<p style="margin:0;">…and ${s.items.length - 25} more</p>` : "")
          )
          .join("") +
        `<p style="margin:16px 0 0 0;"><a href="${escapeHtml(a.sheetUrl)}">Open the sheet</a> · <a href="${listingsUrl}">Admin → Listings</a></p>`,
      footerHtml: "You're getting this because you're a Drive admin. Sent when a synced sheet's problems change.",
    });
    const text =
      `${a.businessName}'s sheet needs a look.\n\n` +
      sections.map((s) => `${s.title}\n${s.note}\n${shown(s.items).map((i) => `- ${i}`).join("\n")}`).join("\n\n") +
      `\n\nSheet: ${a.sheetUrl}\nListings: ${listingsUrl}`;
    const recipients = [...(await adminEmails())];
    await Promise.all(
      recipients.map(async (to) => {
        const sent = await sendEmail({ to, subject: `Sheet check: ${a.businessName} (${sections.map((s) => s.title).join(", ")})`, html, text });
        if (!sent.ok) console.error(`sheet-issues alert to ${to} failed:`, sent.error);
      })
    );
  } catch (err) {
    console.error("sheet-issues alert threw:", err);
  }
}
