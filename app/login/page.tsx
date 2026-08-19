import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

// The main-site "Log in" button only ever leads to the shopper login now —
// broker login lives at /broker/login and isn't linked from the consumer
// site. If a signed-in user lands here, route them to wherever they belong.
export default async function LoginPage() {
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

  redirect("/customer/login");
}
