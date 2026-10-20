"use client";

import { useSyncExternalStore } from "react";
import { adOptedOut, globalPrivacyControl, setAdOptOut } from "@/lib/ad-privacy";

// The opt-out of "sale or sharing": turns off Drive's advertising tag in
// this browser (lib/ad-privacy.ts). Global Privacy Control already does it.
const noSubscribe = () => () => {};

export default function OptOutControl() {
  // Browser-only values ("loading" while server-rendering); choosing
  // reloads the page.
  const status = useSyncExternalStore(
    noSubscribe,
    () => (globalPrivacyControl() ? "gpc" : adOptedOut() ? "out" : "in"),
    () => "loading"
  );

  if (status === "loading") return <div className="h-24" />;
  const state = { optedOut: status === "out" };
  if (status === "gpc") {
    return (
      <div className="panel">
        <p className="font-medium text-fg">You&apos;re opted out.</p>
        <p className="mt-1 text-sm text-fg-secondary">
          Your browser sends a Global Privacy Control signal, so Drive&apos;s advertising tag never loads for you.
          Nothing else to do.
        </p>
      </div>
    );
  }
  return (
    <div className="panel">
      <p className="font-medium text-fg">{state.optedOut ? "You're opted out." : "You're not opted out."}</p>
      <p className="mt-1 text-sm text-fg-secondary">
        {state.optedOut
          ? "Drive's advertising tag is off in this browser. If you clear your cookies or use another browser or device, opt out there too."
          : "Opting out turns off Drive's advertising tag in this browser, so no information about your visits is shared with ad platforms."}
      </p>
      <button
        type="button"
        onClick={() => {
          setAdOptOut(!state.optedOut);
          // Reload so a tag already on the page is gone too.
          location.reload();
        }}
        className={`btn btn-sm mt-4 ${state.optedOut ? "btn-secondary" : "btn-primary"}`}
      >
        {state.optedOut ? "Turn advertising back on" : "Opt out of sale or sharing"}
      </button>
    </div>
  );
}
