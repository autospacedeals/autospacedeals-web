"use client";

// The confirm step of /alerts/unsubscribe, heading included, so that once
// the alerts are stopped the whole card changes to say so (rather than
// still asking "Stop these alerts?" above the confirmation). Focus moves to
// the new heading, since the button that had it is gone, and the
// confirmation goes into a status region that's there from the first
// render so screen readers announce it.
import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { BellOff, CircleCheck } from "lucide-react";
import { MANAGE_ALERTS_PATH } from "@/lib/saved-searches";
import { unsubscribeAction, type UnsubscribeState } from "./actions";

const initialState: UnsubscribeState = { status: "idle", message: null };

export default function UnsubscribeForm({ token, label }: { token: string; label: string }) {
  const [state, formAction, pending] = useActionState(unsubscribeAction, initialState);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const done = state.status === "done";

  useEffect(() => {
    if (done) headingRef.current?.focus();
  }, [done]);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="type-page mt-1 text-3xl outline-none sm:text-3xl">
        {done ? "Alerts stopped" : "Stop these alerts?"}
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {done
          ? "You won't get any more emails about new deals for this saved search:"
          : "You'll stop getting emails about new deals for this saved search:"}
      </p>
      <p className="well mt-4 text-sm font-medium wrap-anywhere text-fg">{label}</p>

      <div role="status" aria-live="polite" className={done ? "mt-8 space-y-5" : undefined}>
        {done && (
          <>
            <p className="alert alert-success">
              <CircleCheck />
              Done — you won&apos;t get these alerts anymore, and the saved search has been deleted.
            </p>
            <p className="text-sm text-fg-muted">
              Changed your mind? Set your filters on the{" "}
              <Link href="/#deals" className="link">
                deals page
              </Link>{" "}
              and save the search again.
            </p>
          </>
        )}
      </div>

      {!done && (
        <form action={formAction} className="mt-8 space-y-5">
          <input type="hidden" name="token" value={token} />

          {state.status === "error" && state.message && (
            <p role="alert" className="alert alert-danger">
              {state.message}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
            <BellOff /> {pending ? "Stopping…" : "Stop these alerts"}
          </button>
          <p className="text-center text-sm text-fg-muted">
            Or{" "}
            <Link href={MANAGE_ALERTS_PATH} className="font-medium text-fg transition-colors hover:text-accent-fg">
              manage all your alerts
            </Link>
          </p>
        </form>
      )}
    </>
  );
}
