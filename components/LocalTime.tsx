"use client";

// A date or time in the viewer's own time zone (lib/time.ts). The server
// doesn't know the zone, so the page first draws it in Pacific and React
// swaps in the browser's zone as soon as it loads.
import { useSyncExternalStore } from "react";
import { DRIVE_TZ, formatWhen, type WhenStyle } from "@/lib/time";

const noSubscribe = () => () => {};
function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DRIVE_TZ;
  } catch {
    return DRIVE_TZ;
  }
}

export default function LocalTime({ iso, style, className }: { iso: string; style: WhenStyle; className?: string }) {
  const zone = useSyncExternalStore(noSubscribe, browserZone, () => DRIVE_TZ);
  return (
    // "Today" can differ between the server's render and the browser's
    // around midnight; the browser's wins.
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {formatWhen(iso, style, zone)}
    </time>
  );
}
