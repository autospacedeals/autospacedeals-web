import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { safeNextPath } from "@/lib/safe-next-path";
import { LogoMark } from "@/components/Logo";
import AdminLoginForm from "./AdminLoginForm";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && (await isAdminEmail(user.email))) redirect(next && next.startsWith("/admin") ? next : "/admin");

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
          <p className="label mt-6">Drive admin</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Sign in</h1>
          {user && (
            <p className="alert mt-4 text-sm">
              You&apos;re signed in as {user.email}, which isn&apos;t an admin account. Sign in with your admin email
              below.
            </p>
          )}
          <div className="mt-8">
            <AdminLoginForm next={next} />
          </div>
        </div>
      </div>
    </main>
  );
}
