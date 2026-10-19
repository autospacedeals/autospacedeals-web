// IndexNow: tells Bing (which ChatGPT search and Copilot draw on) and the
// other IndexNow search engines about a listing the moment it goes live,
// along with its make and model pages, instead of waiting for a crawl.
// The key is public by design: it's served at /820119176ae86cff85df7408e8f884bf.txt to prove the
// site is ours. Production only; never throws.
// SERVER-ONLY.
import { createAdminClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { makePath, modelPath } from "@/lib/lease-pages";

const KEY = "820119176ae86cff85df7408e8f884bf";

export function listingPaths(d: { slug: string; make: string; model: string }): string[] {
  return [`/deals/${d.slug}`, modelPath(d.make, d.model), makePath(d.make), "/leases"];
}

export async function notifyIndexNow(paths: string[]): Promise<void> {
  if (process.env.VERCEL_ENV !== "production" || paths.length === 0) return;
  const host = new URL(SITE_URL).host;
  const urlList = [...new Set(paths)].slice(0, 10000).map((p) => `${SITE_URL}${p}`);
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: KEY, keyLocation: `${SITE_URL}/${KEY}.txt`, urlList }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && res.status !== 202) console.error("IndexNow:", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("IndexNow failed:", err instanceof Error ? err.message : err);
  }
}

// The same, for listings known only by id (published or restored drafts).
export async function notifyIndexNowForDeals(ids: string[]): Promise<void> {
  if (process.env.VERCEL_ENV !== "production" || ids.length === 0) return;
  try {
    const { data } = await createAdminClient()
      .from("deals")
      .select("slug, make, model")
      .in("id", ids)
      .eq("status", "published")
      .returns<{ slug: string; make: string; model: string }[]>();
    await notifyIndexNow((data ?? []).flatMap(listingPaths));
  } catch (err) {
    console.error("IndexNow lookup failed:", err instanceof Error ? err.message : err);
  }
}
