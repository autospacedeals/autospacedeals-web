import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserCircle2, Car, Store, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create a Drive account as a shopper or as a dealer/broker.",
};

// A single entry point for the header's "Sign up" button — keeps the main
// nav to one CTA instead of separate customer/broker buttons, and just asks
// which kind of account before handing off to the real signup form.
export default async function SignupChooserPage() {
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
    redirect(broker ? "/broker/dashboard" : "/customer/dashboard");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-black">Create your account</h1>
        <p className="mt-2 text-zinc-400">First, tell us who you are.</p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/customer/signup"
          className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 transition hover:border-white/30 hover:bg-white/[0.07]"
        >
          <Car size={28} className="text-zinc-400 transition group-hover:text-white" />
          <h2 className="mt-4 text-xl font-bold">I&apos;m a shopper</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Browse lease and finance deals from dealers and brokers, and save the ones you
            like.
          </p>
          <span className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-white">
            Sign up as a shopper <ArrowRight size={15} />
          </span>
        </Link>

        <Link
          href="/broker/signup"
          className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 transition hover:border-white/30 hover:bg-white/[0.07]"
        >
          <Store size={28} className="text-zinc-400 transition group-hover:text-white" />
          <h2 className="mt-4 text-xl font-bold">I&apos;m a dealer or broker</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            List your inventory and get in front of ready-to-buy shoppers — free while we&apos;re
            in early access.
          </p>
          <span className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-white">
            Create a broker account <ArrowRight size={15} />
          </span>
        </Link>
      </div>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-sm text-zinc-500">
        <UserCircle2 size={15} /> Already have an account?{" "}
        <Link href="/customer/login" className="font-semibold text-white hover:underline">
          Shopper sign in
        </Link>
        <span className="text-zinc-700">·</span>
        <Link href="/broker/login" className="font-semibold text-white hover:underline">
          Broker sign in
        </Link>
      </p>
    </main>
  );
}
