import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import AdminNav from "@/components/AdminNav";

// Admin pages get the admin tabs across the top (not the login page, and
// not for anyone who isn't an admin — each page also checks that itself).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = user && (await isAdminEmail(user.email));
  return (
    <>
      {admin && <AdminNav email={user.email ?? ""} />}
      {children}
    </>
  );
}
