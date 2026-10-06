// Download of the signed-in seller's full ad archive (lib/ad-archive.ts).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adVersionsCsv, getAdVersions } from "@/lib/ad-archive";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Please log in.", { status: 401 });

  const rows = await getAdVersions(supabase, user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + adVersionsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="drive-ad-archive-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
