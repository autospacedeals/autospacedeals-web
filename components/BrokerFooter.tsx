import Link from "next/link";

// Minimal footer for the broker/dealer portal — no shopper nav, just legal
// links and a copyright line.
export default function BrokerFooter() {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="container-page py-6">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
          <span>© {new Date().getFullYear()} Drive. All rights reserved.</span>
          <Link href="/privacy" className="link-quiet">
            Privacy Policy
          </Link>
          <Link href="/terms" className="link-quiet">
            Terms of Service
          </Link>
        </p>
      </div>
    </footer>
  );
}
