// Who a tracking request (/api/track, /api/theme) counts as: the visitor id
// from the first-party cookie, or null for bots and for signed-in brokers and
// admins browsing their own site, who aren't shoppers. SERVER-ONLY.
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { VISITOR_COOKIE, isValidVisitorId } from "@/lib/visit-source";

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python|axios/i;

export async function countedVisitor(request: NextRequest): Promise<string | null> {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return null;

  const visitor = request.cookies.get(VISITOR_COOKIE)?.value;
  if (!isValidVisitorId(visitor)) return null;

  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      if (await isAdminEmail(user.email)) return null;
      const { data: broker } = await supabase.from("brokers").select("id").eq("id", user.id).maybeSingle();
      if (broker) return null;
    }
  }
  return visitor!;
}
