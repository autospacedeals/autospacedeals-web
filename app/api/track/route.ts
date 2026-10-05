// Visit and listing-view counter for the admin Leads page (components/
// VisitTracker.tsx sends these; supabase/migrations/0033_lead_tracking.sql).
// Best-effort and always answers 204 — a counting problem must never show
// up for the visitor. Bots, and signed-in brokers and admins browsing their
// own site, aren't counted. The visitor's approximate city comes from
// Vercel's IP lookup; the IP address itself isn't stored.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { SOURCE_COOKIE, VISITOR_COOKIE, decodeSource, isValidVisitorId } from "@/lib/visit-source";

export const dynamic = "force-dynamic";

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|axios/i;
// The same visitor opening the same listing (or landing again) within this
// long counts once.
const DEDUPE_MS = 30 * 60 * 1000;

const done = () => new NextResponse(null, { status: 204 });

// Approximate location from Vercel's IP lookup (not set when running locally).
function header(request: NextRequest, name: string, max: number): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // keep as sent
  }
  return value.trim().slice(0, max) || null;
}

export async function POST(request: NextRequest) {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    if (!ua || BOT_UA.test(ua)) return done();

    const visitor = request.cookies.get(VISITOR_COOKIE)?.value;
    if (!isValidVisitorId(visitor)) return done();

    const body = (await request.json().catch(() => null)) as { kind?: unknown; path?: unknown } | null;
    const kind = body?.kind === "listing" ? "listing" : body?.kind === "landing" ? "landing" : null;
    const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "";
    if (!kind || !path.startsWith("/")) return done();

    // Brokers and admins looking at the site aren't shoppers.
    if (request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        if (await isAdminEmail(user.email)) return done();
        const { data: broker } = await supabase.from("brokers").select("id").eq("id", user.id).maybeSingle();
        if (broker) return done();
      }
    }

    const admin = createAdminClient();
    let dealId: string | null = null;
    let brokerId: string | null = null;
    if (kind === "listing") {
      const slug = /^\/deals\/([^/?#]+)/.exec(path)?.[1];
      if (!slug) return done();
      const { data: deal } = await admin
        .from("deals")
        .select("id, broker_id")
        .eq("slug", decodeURIComponent(slug))
        .eq("status", "published")
        .maybeSingle<{ id: string; broker_id: string | null }>();
      if (!deal) return done();
      dealId = deal.id;
      brokerId = deal.broker_id;
    }

    let recent = admin
      .from("site_visits")
      .select("id", { count: "exact", head: true })
      .eq("visitor", visitor)
      .eq("kind", kind)
      .gte("created_at", new Date(Date.now() - DEDUPE_MS).toISOString());
    if (dealId) recent = recent.eq("deal_id", dealId);
    const { count } = await recent;
    if ((count ?? 0) > 0) return done();

    const src = decodeSource(request.cookies.get(SOURCE_COOKIE)?.value);
    const { error } = await admin.from("site_visits").insert({
      visitor,
      kind,
      path,
      deal_id: dealId,
      broker_id: brokerId,
      source: src?.source ?? null,
      campaign: src?.campaign ?? null,
      country: header(request, "x-vercel-ip-country", 8),
      region: header(request, "x-vercel-ip-country-region", 16),
      city: header(request, "x-vercel-ip-city", 80),
    });
    if (error) console.error("track: insert failed:", error.message);
  } catch (err) {
    console.error("track threw:", err);
  }
  return done();
}
