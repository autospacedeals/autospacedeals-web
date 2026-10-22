// Mobile, tablet or desktop, from a request's user agent, for counting
// visits by device (app/api/track/route.ts). Rough by nature: iPads on
// iPadOS 13+ send the same user agent as a Mac, so they count as desktop.
export type DeviceType = "mobile" | "tablet" | "desktop";

const TABLET = /ipad|tablet|kindle|silk|playbook|android(?!.*mobile)/i;
const MOBILE = /mobi|iphone|ipod|android|windows phone|blackberry|opera mini/i;

export function deviceType(userAgent: string, chMobile?: string | null): DeviceType {
  // Chromium browsers also say outright whether they're on a phone.
  if (chMobile === "?1") return "mobile";
  if (TABLET.test(userAgent)) return "tablet";
  if (MOBILE.test(userAgent)) return "mobile";
  return "desktop";
}
