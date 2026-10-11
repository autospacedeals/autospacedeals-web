// "Still here" ping from a signed-in visitor (components/SeenPing.tsx): records
// when the account was last on the site, for Admin -> Users.
// supabase/migrations/0040_account_activity.sql.
import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await createAdminClient()
        .from("account_activity")
        .upsert({ user_id: user.id, last_seen_at: new Date().toISOString() });
      if (error) console.error("seen: upsert failed:", error.message);
    }
  } catch (err) {
    console.error("seen failed:", err instanceof Error ? err.message : err);
  }
  return new NextResponse(null, { status: 204 });
}
