import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { accountHome } from "@/lib/account-home";

export const metadata: Metadata = { title: "Email change", robots: { index: false } };
export const dynamic = "force-dynamic";

// Where the "confirm your new email" links land (app/auth/confirm/route.ts).
// Both the old and the new address get a link; the change happens once
// both are opened.
export default async function EmailConfirmedPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const done = user && !user.new_email;
  return (
    <main className="container-page max-w-xl py-16 sm:py-20">
      <div className="panel">
        {expired ? (
          <>
            <h1 className="type-title">This link has expired or was already used</h1>
            <p className="mt-2 text-fg-secondary">
              {user?.new_email
                ? `Your email is still ${user.email}. Open the newest link we sent, or start the change again from the Account section of your dashboard.`
                : "If your email hasn't changed, start the change again from the Account section of your dashboard."}
            </p>
          </>
        ) : done ? (
          <>
            <h1 className="type-title">Your email is now {user.email}</h1>
            <p className="mt-2 text-fg-secondary">Use it to sign in from now on.</p>
          </>
        ) : user ? (
          <>
            <h1 className="type-title">One more step</h1>
            <p className="mt-2 text-fg-secondary">
              That link is confirmed. Now open the link we sent to the other address ({user.new_email}) and the change is
              done.
            </p>
          </>
        ) : (
          <>
            <h1 className="type-title">Link confirmed</h1>
            <p className="mt-2 text-fg-secondary">
              If you haven&apos;t yet, open the confirmation link we sent to your other email address too. Once both are
              opened, sign in with your new email.
            </p>
          </>
        )}
        <Link href={user ? await accountHome(supabase, user) : "/customer/login"} className="btn btn-secondary btn-sm mt-6">
          {user ? "Back to your dashboard" : "Sign in"}
        </Link>
      </div>
    </main>
  );
}
