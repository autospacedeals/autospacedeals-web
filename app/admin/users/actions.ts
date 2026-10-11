"use server";

// Approving a new broker or dealership salesperson once their DMV license
// checks out (supabase/migrations/0038_seller_verification.sql). Their
// listings become public the moment approved_at is set.
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/server";
import { emailSellerApproved } from "@/lib/seller-verification";
import { emailLayoutHtml, escapeHtml, isEmailConfigured, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export async function approveSellerAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/users");
  const id = String(formData.get("brokerId") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  const { data: broker, error } = await admin
    .from("brokers")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", id)
    .is("approved_at", null)
    .select("contact_name, business_name")
    .maybeSingle<{ contact_name: string | null; business_name: string }>();
  if (error) {
    console.error("approveSeller failed:", error.message);
    return;
  }
  if (!broker) return; // already approved

  // Cars they posted while waiting count as just listed from today.
  const { data: live } = await admin
    .from("deals")
    .update({ date_posted: new Date().toISOString().slice(0, 10) })
    .eq("broker_id", id)
    .eq("status", "published")
    .select("id");

  const email = (await admin.auth.admin.getUserById(id)).data.user?.email ?? "";
  const name = broker.contact_name || broker.business_name;
  after(() => emailSellerApproved(email, name, live?.length ?? 0));

  revalidatePath("/admin/users");
  revalidatePath("/");
}

// A seller's request for more listing assistant messages
// (0042_listing_assistant_requests.sql). Approving adds the request's extra
// messages for the next 24 hours and emails them.
export async function decideAssistantRequestAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/users");
  const id = String(formData.get("requestId") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!id) return;

  const admin = createAdminClient();
  const { data: request, error } = await admin
    .from("listing_assistant_requests")
    .update({ status: approve ? "approved" : "denied", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("broker_id, extra")
    .maybeSingle<{ broker_id: string; extra: number }>();
  if (error) {
    console.error("decideAssistantRequest failed:", error.message);
    return;
  }
  if (!request) return; // already decided

  if (approve) {
    const [{ data: broker }, { data: user }] = await Promise.all([
      admin
        .from("brokers")
        .select("contact_name, business_name")
        .eq("id", request.broker_id)
        .maybeSingle<{ contact_name: string | null; business_name: string }>(),
      admin.auth.admin.getUserById(request.broker_id),
    ]);
    const to = user.user?.email ?? "";
    const name = broker?.contact_name || broker?.business_name || "there";
    after(() => emailAssistantApproved(to, name, request.extra));
  }
  revalidatePath("/admin/users");
  revalidatePath("/broker/dashboard");
}

async function emailAssistantApproved(to: string, name: string, extra: number): Promise<void> {
  if (!isEmailConfigured() || !to) return;
  try {
    const url = `${SITE_URL}/broker/dashboard#assistant`;
    const line = `You can send the listing assistant ${extra} more messages over the next 24 hours.`;
    const html = emailLayoutHtml({
      preheader: line,
      heading: "More assistant messages",
      bodyHtml:
        `<p style="margin:0 0 12px 0;">Hi ${escapeHtml(name)}, ${escapeHtml(line)}</p>` +
        `<p style="margin:0;"><a href="${url}">Open the listing assistant</a></p>`,
      footerHtml: "You're getting this because you asked for more listing assistant messages on Drive.",
    });
    const sent = await sendEmail({ to, subject: "Your listing assistant request is approved", html, text: `Hi ${name}, ${line}\n\n${url}` });
    if (!sent.ok) console.error("assistant-approved email failed:", sent.error);
  } catch (err) {
    console.error("assistant-approved email threw:", err);
  }
}
