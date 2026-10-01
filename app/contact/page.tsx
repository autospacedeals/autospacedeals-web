import type { Metadata } from "next";
import ContactForm from "./ContactForm";
import { createClient } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/site";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = pageMetadata({
  title: "Contact Support",
  description: "Questions about a deal, your account, or listing on Drive? Send us a message.",
  path: "/contact",
});

export default async function ContactPage() {
  // Signed-in visitors don't have to type their email.
  let email = "";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? "";
  } catch (err) {
    console.error("contact page: getUser failed:", err);
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
          <p className="label mt-6">Support</p>
          <h1 className="type-page mt-1 text-3xl sm:text-3xl">Contact us</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Questions about a deal, your account, or listing your inventory? Send us a message and
            we&apos;ll reply by email.
          </p>
          <div className="mt-8">
            <ContactForm defaultEmail={email} />
          </div>
        </div>
      </div>
    </main>
  );
}
