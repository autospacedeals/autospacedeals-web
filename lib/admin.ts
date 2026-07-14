// Email addresses allowed to access the /admin review queue. Keep this list
// short — anyone signed in with a matching email gets full access to every
// broker's submissions.
export const ADMIN_EMAILS = ["mheryanrobert@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
