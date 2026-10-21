// Records a light/dark pick from the header toggle (components/ThemeToggle.tsx)
// for the admin Leads page (supabase/migrations/0052_theme_choices.sql).
// Best-effort and always 204, like /api/track.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { countedVisitor } from "@/lib/counted-visitor";

export const dynamic = "force-dynamic";

const done = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { theme?: unknown; path?: unknown } | null;
    const theme = body?.theme === "light" ? "light" : body?.theme === "dark" ? "dark" : null;
    const path = typeof body?.path === "string" && body.path.startsWith("/") ? body.path.slice(0, 300) : "/";
    if (!theme) return done();

    const visitor = await countedVisitor(request);
    if (!visitor) return done();

    const { error } = await createAdminClient().from("theme_choices").insert({ visitor, theme, path });
    if (error) console.error("theme: insert failed:", error.message);
  } catch (err) {
    console.error("theme threw:", err);
  }
  return done();
}
