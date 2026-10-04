// Everything the /admin pages show about accounts: every sign-up, what kind
// of account it is, contact details and activity. SERVER-ONLY — reads auth
// users and private profile fields with the service role; only call it
// after requireAdmin().
import { createAdminClient } from "@/lib/supabase/server";

export interface AdminAccount {
  id: string;
  kind: "broker" | "shopper" | "incomplete";
  name: string; // business name (broker) or first + last (shopper)
  contactName: string | null; // broker's contact person
  email: string;
  phone: string | null;
  location: string; // "City, ST" (broker) or "zip 91401" (shopper)
  signedUpAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  via: "Google" | "Email";
  liveListings: number; // brokers
  draftListings: number; // brokers
  conversations: number;
  savedDeals: number; // shoppers
  savedSearches: number; // shoppers
}

interface AuthUserLite {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { providers?: string[] };
}

async function allAuthUsers(): Promise<AuthUserLite[]> {
  const admin = createAdminClient();
  const users: AuthUserLite[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("admin listUsers failed:", error.message);
      break;
    }
    users.push(...(data.users as AuthUserLite[]));
    if (data.users.length < 1000) break;
  }
  return users;
}

function countBy<T>(rows: T[] | null, key: (row: T) => string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const k = key(row);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export async function listAccounts(): Promise<AdminAccount[]> {
  const admin = createAdminClient();
  const [users, brokers, customers, deals, conversations, saved, searches] = await Promise.all([
    allAuthUsers(),
    admin.from("brokers").select("id, business_name, contact_name, contact_phone, city, state"),
    admin.from("customers").select("id, first_name, last_name, zip_code, phone"),
    admin.from("deals").select("broker_id, status").neq("status", "removed"),
    admin.from("conversations").select("customer_id, broker_id"),
    admin.from("saved_deals").select("customer_id"),
    admin.from("saved_searches").select("customer_id"),
  ]);

  type BrokerRow = { id: string; business_name: string; contact_name: string | null; contact_phone: string | null; city: string; state: string };
  type CustomerRow = { id: string; first_name: string; last_name: string; zip_code: string; phone: string | null };
  const brokerById = new Map(((brokers.data ?? []) as BrokerRow[]).map((b) => [b.id, b]));
  const customerById = new Map(((customers.data ?? []) as CustomerRow[]).map((c) => [c.id, c]));
  const dealRows = (deals.data ?? []) as { broker_id: string | null; status: string }[];
  const live = countBy(dealRows.filter((d) => d.status === "published"), (d) => d.broker_id);
  const drafts = countBy(dealRows.filter((d) => d.status === "draft"), (d) => d.broker_id);
  const convRows = (conversations.data ?? []) as { customer_id: string; broker_id: string }[];
  const convByCustomer = countBy(convRows, (c) => c.customer_id);
  const convByBroker = countBy(convRows, (c) => c.broker_id);
  const savedBy = countBy((saved.data ?? []) as { customer_id: string }[], (r) => r.customer_id);
  const searchesBy = countBy((searches.data ?? []) as { customer_id: string }[], (r) => r.customer_id);

  return users
    .map((u): AdminAccount => {
      const b = brokerById.get(u.id);
      const c = customerById.get(u.id);
      const base = {
        id: u.id,
        email: u.email ?? "",
        signedUpAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        emailConfirmed: Boolean(u.email_confirmed_at),
        via: (u.app_metadata?.providers ?? []).includes("google") ? ("Google" as const) : ("Email" as const),
        liveListings: live.get(u.id) ?? 0,
        draftListings: drafts.get(u.id) ?? 0,
        savedDeals: savedBy.get(u.id) ?? 0,
        savedSearches: searchesBy.get(u.id) ?? 0,
      };
      if (b) {
        return {
          ...base,
          kind: "broker",
          name: b.business_name,
          contactName: b.contact_name,
          phone: b.contact_phone,
          location: `${b.city}, ${b.state}`,
          conversations: convByBroker.get(u.id) ?? 0,
        };
      }
      if (c) {
        return {
          ...base,
          kind: "shopper",
          name: `${c.first_name} ${c.last_name}`.trim(),
          contactName: null,
          phone: c.phone,
          location: `zip ${c.zip_code}`,
          conversations: convByCustomer.get(u.id) ?? 0,
        };
      }
      return { ...base, kind: "incomplete", name: "—", contactName: null, phone: null, location: "—", conversations: 0 };
    })
    .sort((a, b) => b.signedUpAt.localeCompare(a.signedUpAt));
}

// Finds a sign-in account by email (null if none).
export async function findAuthUserByEmail(email: string): Promise<AuthUserLite | null> {
  const target = email.trim().toLowerCase();
  return (await allAuthUsers()).find((u) => (u.email ?? "").toLowerCase() === target) ?? null;
}
