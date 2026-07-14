// Supabase client for use on the server (Server Components, Server Actions,
// Route Handlers). Reads/writes the auth session via cookies.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies — safe to
            // ignore as long as middleware.ts is refreshing the session.
          }
        },
      },
    }
  );
}

// Admin client — bypasses Row Level Security using the service role key.
// SERVER-ONLY. Never import this from a Client Component or expose the key
// to the browser. Used exclusively by the /admin review-queue pages/actions.
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op — the admin client doesn't manage a user session
        },
      },
    }
  );
}
