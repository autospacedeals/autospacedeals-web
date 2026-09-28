import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { safeNextPath } from "@/lib/safe-next-path";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Drive account.",
};

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Where to go after signing in, e.g. back to the broker profile a
  // "Log in to leave a review" link came from. Only same-site paths are
  // kept (see lib/safe-next-path.ts); anything else means the dashboard.
  const next = safeNextPath((await searchParams).next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    if (isAdminEmail(user.email)) redirect("/admin/submissions");
    const { data: broker } = await supabase
      .from("brokers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    redirect(broker ? "/broker/dashboard" : (next ?? "/customer/dashboard"));
  }

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(47_123_255/0.14),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
          <p className="label mt-6">Customer account</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-fg-muted">Access your saved deals and account info.</p>
          <div className="mt-8">
            <LoginForm next={next} />
          </div>
        </div>
      </div>
    </main>
  );
}
