// Whether this visitor allows Drive's advertising tag (Google Ads). Off when
// they opted out on /privacy/choices (a first-party cookie) or their browser
// sends Global Privacy Control, which California treats as an opt-out of
// "sharing" for cross-context advertising. CLIENT-ONLY.
export const AD_OPT_OUT_COOKIE = "drive_ads_optout";

export function globalPrivacyControl(): boolean {
  return typeof navigator !== "undefined" && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function adOptedOut(): boolean {
  return typeof document !== "undefined" && document.cookie.split("; ").some((c) => c === `${AD_OPT_OUT_COOKIE}=1`);
}

export function setAdOptOut(optOut: boolean): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = optOut
    ? `${AD_OPT_OUT_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 365 * 2}; SameSite=Lax${secure}`
    : `${AD_OPT_OUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function adsAllowed(): boolean {
  return !globalPrivacyControl() && !adOptedOut();
}
