"use server";

// The "Contact support" form (/contact): emails the message to Drive's
// inbox through Resend, with the visitor's address as Reply-To so a reply
// goes straight back to them. A mailto: link only works for people with a
// mail app set up, which is why this is a form.
//
// Anyone can send it, so a hidden "website" field catches form-filling bots
// and each IP address gets at most CONTACT_LIMIT messages a day, counted in
// match_email_log (the Get matched send log, 0018 — rows with no deal).
//
// Every message is also saved in contact_messages (0028) and listed at
// /admin/contact, so it isn't lost if the email gets filtered.
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/supabase/with-timeout";
import { emailLayoutHtml, escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { isValidEmailAddress } from "@/lib/get-matched";

const SUPPORT_INBOX = "rob@idriveus.com";
const CONTACT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const NAME_MAX = 100;
const MESSAGE_MAX = 5000;

export type ContactState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; error: string; values: { name: string; email: string; topic: string; message: string } };

const TOPICS = ["Shopping for a car", "Dealer or broker account", "A listing", "Something else"] as const;

export async function sendContactAction(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, NAME_MAX);
  const email = String(formData.get("email") ?? "").trim().slice(0, 254);
  const topicRaw = String(formData.get("topic") ?? "");
  const topic = TOPICS.find((t) => t === topicRaw) ?? "Something else";
  const message = String(formData.get("message") ?? "").trim().slice(0, MESSAGE_MAX);
  const values = { name, email, topic, message };
  const fail = (error: string): ContactState => ({ status: "error", error, values });

  // A bot filled in the hidden field: say it worked, send nothing.
  if (String(formData.get("website") ?? "")) return { status: "sent" };

  if (!email || !message) return fail("Please add your email and a message.");
  if (!isValidEmailAddress(email)) return fail("That email address doesn't look right — please check it.");
  if (!isEmailConfigured()) {
    return fail(`The contact form isn't working right now. Please email ${SUPPORT_INBOX} directly.`);
  }

  const ip = await requesterIp();
  if (ip && !(await withinLimit(ip, email.toLowerCase()))) {
    return fail(`You've sent a few messages already today. Please email ${SUPPORT_INBOX} directly.`);
  }

  const from = name ? `${name} <${email}>` : email;
  const text = `From: ${from}\nTopic: ${topic}\n\n${message}`;
  const html = emailLayoutHtml({
    preheader: message.slice(0, 120),
    heading: `Contact form: ${topic}`,
    bodyHtml: `<p style="margin:0 0 12px 0;"><strong>From:</strong> ${escapeHtml(from)}</p>
<p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>`,
    footerHtml: "Sent from the contact form on idriveus.com. Reply to this email to answer them.",
  });

  const savedId = await saveMessage({ name, email, topic, message, ip });

  const sent = await sendEmail({
    to: SUPPORT_INBOX,
    replyTo: email,
    subject: `Drive contact: ${topic}${name ? ` — ${name}` : ""}`,
    html,
    text,
  });
  if (sent.ok && savedId) await markEmailed(savedId);
  if (!sent.ok) {
    console.error("contact form: send failed:", sent.error);
    // Saved for the admin page, so it still reached us.
    if (savedId) return { status: "sent" };
    return fail(`We couldn't send your message. Please try again, or email ${SUPPORT_INBOX} directly.`);
  }
  return { status: "sent" };
}

// Stores the message for /admin/contact; returns its id, or null if the
// table can't be used (the email still goes out).
async function saveMessage(row: {
  name: string;
  email: string;
  topic: string;
  message: string;
  ip: string | null;
}): Promise<string | null> {
  try {
    const { data, error } = await withTimeout(
      createAdminClient()
        .from("contact_messages")
        .insert({ ...row, name: row.name || null })
        .select("id")
        .single<{ id: string }>(),
      5000,
      "contact message insert"
    );
    if (error) {
      console.error("contact form: save failed:", error.message);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error("contact form: save threw:", err);
    return null;
  }
}

async function markEmailed(id: string): Promise<void> {
  try {
    const { error } = await withTimeout(
      createAdminClient().from("contact_messages").update({ emailed: true }).eq("id", id),
      5000,
      "contact message update"
    );
    if (error) console.error("contact form: mark emailed failed:", error.message);
  } catch (err) {
    console.error("contact form: mark emailed threw:", err);
  }
}

async function requesterIp(): Promise<string | null> {
  const list = await headers();
  const raw = list.get("x-forwarded-for")?.split(",")[0] ?? list.get("x-real-ip") ?? "";
  const ip = raw.trim().toLowerCase();
  return ip && ip.length <= 64 ? ip : null;
}

// Logs this message and checks the day's count for the IP. If the log
// can't be used (table missing, service key unset) the message still goes
// through — it only ever goes to Drive's own inbox.
async function withinLimit(ip: string, email: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const { count, error } = await withTimeout(
      admin.from("match_email_log").select("id", { count: "exact", head: true }).eq("ip", ip).is("deal_id", null).gte("created_at", since),
      5000,
      "contact log count"
    );
    if (error) {
      console.error("contact form: log count failed:", error.message);
      return true;
    }
    if ((count ?? 0) >= CONTACT_LIMIT) return false;
    const { error: insertError } = await withTimeout(
      admin.from("match_email_log").insert({ email, ip, deal_id: null }),
      5000,
      "contact log insert"
    );
    if (insertError) console.error("contact form: log insert failed:", insertError.message);
    return true;
  } catch (err) {
    console.error("contact form: limit check threw:", err);
    return true;
  }
}
