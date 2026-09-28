"use server";

// "Stop these alerts" on /alerts/unsubscribe. The unsubscribe token from an
// alert email is the only credential — there's no login — so the lookup is
// keyed strictly on that (uuid-checked) token with the service role, and it
// only ever deletes the one saved search the token belongs to.
import { createAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/supabase/with-timeout";
import { isMissingRelationError } from "@/lib/supabase/saved-searches";

export type UnsubscribeState = {
  status: "idle" | "done" | "error";
  message: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function unsubscribeAction(
  _prevState: UnsubscribeState,
  formData: FormData
): Promise<UnsubscribeState> {
  const token = formData.get("token");
  if (typeof token !== "string" || !UUID_RE.test(token)) {
    return { status: "error", message: "This unsubscribe link isn't valid. Use the link from your most recent alert email." };
  }

  try {
    const supabase = createAdminClient();
    const { error } = await withTimeout(
      supabase.from("saved_searches").delete().eq("unsubscribe_token", token),
      10000,
      "unsubscribeAction"
    );
    if (error) {
      console.error("unsubscribeAction failed:", error.code, error.message);
      return {
        status: "error",
        message: isMissingRelationError(error.code)
          ? "Alerts aren't available right now. Please try again later."
          : "We couldn't stop these alerts. Please try again.",
      };
    }
    // Already gone (pressed twice, or deleted from the dashboard) is still
    // the outcome that was asked for.
    return { status: "done", message: null };
  } catch (err) {
    console.error("unsubscribeAction threw:", err);
    return { status: "error", message: "We couldn't stop these alerts. Please try again." };
  }
}
