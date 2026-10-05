"use client";

// Shown when a broker's Google Sheet is private: share it with Drive's
// reader address as a viewer — ordinary Google sharing, no sign-in or
// permission screens. While this box is open the page keeps re-checking,
// so the sheet's tabs appear on their own as soon as it's shared.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { listSheetTabsAction } from "./actions";

type Tabs = { name: string; rows: number }[];

const CHECK_EVERY_MS = 5000;
const STOP_AFTER_MS = 20 * 60 * 1000;

export default function ShareSheetBox({
  sheetUrl,
  email,
  onShared,
}: {
  sheetUrl: string;
  email: string;
  onShared: (tabs: Tabs) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState(false);
  const onSharedRef = useRef(onShared);
  useEffect(() => {
    onSharedRef.current = onShared;
  }, [onShared]);

  useEffect(() => {
    const started = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (cancelled) return;
      if (Date.now() - started > STOP_AFTER_MS) {
        setStopped(true);
        return;
      }
      // Only while the broker can see this page (they're often over in
      // Google Sheets sharing it); checks again right when they come back.
      if (document.visibilityState === "visible") {
        const result = await listSheetTabsAction(sheetUrl).catch(() => null);
        if (cancelled) return;
        if (result?.tabs) {
          onSharedRef.current(result.tabs);
          return;
        }
      }
      timer = setTimeout(check, CHECK_EVERY_MS);
    };
    timer = setTimeout(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sheetUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the address is selectable below.
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-hover p-3.5">
      <p className="text-sm font-medium text-fg">This sheet is private — share it with us to continue</p>
      <ol className="mt-2 space-y-2.5 text-sm text-fg-secondary">
        <li>
          <span className="font-medium text-fg">1.</span> Copy our address:
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs break-all text-fg select-all">
              {email}
            </code>
            <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </li>
        <li>
          <span className="font-medium text-fg">2.</span>{" "}
          <a href={sheetUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
            Open your sheet <ExternalLink size={13} />
          </a>
          , click <span className="font-medium text-fg">Share</span>, paste the address, switch{" "}
          <span className="font-medium text-fg">Editor</span> to <span className="font-medium text-fg">Viewer</span>, and
          click <span className="font-medium text-fg">Send</span>.
        </li>
      </ol>
      <p className="mt-3 text-xs text-fg-muted">
        View-only — we can read the sheet but never change it, and you can remove us anytime from
        the same Share menu.
      </p>
      {stopped ? (
        <p className="mt-2 text-xs text-fg-secondary">Shared it? Click &quot;Re-check tabs&quot; above.</p>
      ) : (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-fg-secondary">
          <Loader2 size={12} className="animate-spin" /> Waiting for it to be shared — your tabs will show
          up here automatically.
        </p>
      )}
    </div>
  );
}
