// The "by creating an account you agree…" line next to every sign-up
// button, so the Terms and Privacy Policy are clearly presented when an
// account is created. Opens them in a new tab so a half-filled form isn't lost.
export default function LegalConsent({ action = "creating an account" }: { action?: string }) {
  return (
    <p className="text-center text-xs leading-5 text-fg-muted">
      By {action}, you agree to Drive&apos;s{" "}
      <a href="/terms" target="_blank" rel="noopener" className="link">
        Terms of Service
      </a>{" "}
      and{" "}
      <a href="/privacy" target="_blank" rel="noopener" className="link">
        Privacy Policy
      </a>
      .
    </p>
  );
}
