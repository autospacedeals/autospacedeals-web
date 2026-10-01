import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { safeNextPath } from "@/lib/safe-next-path";
import { LogoMark } from "@/components/Logo";
import CompleteProfileForm from "./CompleteProfileForm";

export const metadata: Metadata = {
  title: "Finish your account",
  robots: { index: false },
};

// Where "Continue with Google" lands someone the first time (see
// app/auth/callback/route.ts): signed in, but without the customer profile
// the rest of the site expects. Prefills the name from their Google account.
export default async function CompleteProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const next = safeNextPath((await searchParams).next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/customer/login");
  if (isAdminEmail(user.email)) redirect("/admin/submissions");

  const [{ data: customer }, { data: broker }] = await Promise.all([
    supabase.from("customers").select("id").eq("id", user.id).maybeSingle(),
    supabase.from("brokers").select("id").eq("id", user.id).maybeSingle(),
  ]);
  if (broker) redirect("/broker/dashboard");
  if (customer) redirect(next ?? "/customer/dashboard");

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const fullName = text(meta.full_name) || text(meta.name);
  const firstName = text(meta.given_name) || fullName.split(/\s+/)[0] || "";
  const lastName = text(meta.family_name) || fullName.split(/\s+/).slice(1).join(" ");

  return (
    <main className="relative isolate px-4 py-16 sm:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(50%_60%_at_50%_0%,rgb(47_123_255/0.14),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="panel p-8 shadow-pop sm:p-10">
          <LogoMark decorative className="size-10 text-fg" />
          <p className="label mt-6">Almost done</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Finish your account</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Signed in as <span className="font-medium text-fg">{user.email}</span>. Add your zip code
            so we can show deals near you.
          </p>
          <div className="mt-8">
            <CompleteProfileForm firstName={firstName} lastName={lastName} next={next} />
          </div>
        </div>
      </div>
    </main>
  );
}
