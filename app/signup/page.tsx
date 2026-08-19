import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

// The main-site "Sign up" button only ever leads to the shopper signup now —
// broker signup lives at /broker/signup and isn't linked from the consumer
// site (it's still reachable from the "For Dealers & Brokers" homepage
// section, which is the actual acquisition path). If a signed-in user lands
// here, route them to wherever they belong.
export default async function SignupPage() {
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

  redirect("/customer/signup");
}
