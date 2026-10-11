"use client";

// Tells the server a signed-in account is on the site (app/api/seen), at
// most every 10 minutes per browser, for Admin -> Users' "Last on site".
// Renders nothing.
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const KEY = "drive_seen_at";
const EVERY_MS = 10 * 60 * 1000;

export default function SeenPing() {
  const pathname = usePathname();

  useEffect(() => {
    let last = 0;
    try {
      last = Number(localStorage.getItem(KEY)) || 0;
    } catch {
      // storage blocked: ping anyway; the server just updates a timestamp
    }
    if (Date.now() - last < EVERY_MS) return;
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // ignore
    }
    fetch("/api/seen", { method: "POST", keepalive: true }).catch(() => {});
  }, [pathname]);

  return null;
}
