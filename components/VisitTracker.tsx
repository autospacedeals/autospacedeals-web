"use client";

// Counts visits and listing views for the admin Leads page, and remembers
// how the visitor found the site (lib/visit-source.ts) in a first-party
// cookie so a later sign-up or message can be credited to that ad or site.
// Renders nothing. Broker and admin pages aren't counted.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  SOURCE_COOKIE,
  SOURCE_MAX_AGE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
  encodeSource,
  isValidVisitorId,
  sourceFromLanding,
} from "@/lib/visit-source";

const LANDED_KEY = "drive_landed";

function readCookie(name: string): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function send(kind: "landing" | "listing", path: string) {
  const body = JSON.stringify({ kind, path });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(
    () => {}
  );
}

export default function VisitTracker() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (/^\/(admin|broker\/dashboard|api)(\/|$)/.test(pathname)) return;
    try {
      if (!isValidVisitorId(readCookie(VISITOR_COOKIE))) {
        writeCookie(VISITOR_COOKIE, crypto.randomUUID(), VISITOR_MAX_AGE);
      }

      let landed = false;
      try {
        landed = sessionStorage.getItem(LANDED_KEY) === "1";
      } catch {
        // storage blocked: count it as a landing each page, deduped server-side
      }

      // A new source (ad, referring site) replaces the old one; a visit with
      // none only sets "direct" when nothing is known yet.
      const found = sourceFromLanding(location.search, landed ? "" : document.referrer, location.host);
      if (found) writeCookie(SOURCE_COOKIE, encodeSource(found), SOURCE_MAX_AGE);
      else if (!landed && !readCookie(SOURCE_COOKIE)) {
        writeCookie(SOURCE_COOKIE, encodeSource({ source: "direct", campaign: null }), SOURCE_MAX_AGE);
      }

      if (!landed || found) {
        send("landing", pathname);
        try {
          sessionStorage.setItem(LANDED_KEY, "1");
        } catch {
          // ignore
        }
      }
      if (pathname.startsWith("/deals/")) send("listing", pathname);
    } catch {
      // never break the page over counting
    }
  }, [pathname]);

  return null;
}
