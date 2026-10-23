"use client";

// Under a shopper's conversation once they've written to a seller: "Get a
// text when they reply", with the same opt-in as on their account page
// (SmsSettings — the wording registered with the carriers). "Not now"
// hides it on this device.
import { useEffect, useState } from "react";
import SmsSettings from "@/components/messages/SmsSettings";

const DISMISS_KEY = "drive_text_prompt_dismissed";

export default function TextRepliesPrompt({ sellerName, defaultPhone }: { sellerName: string; defaultPhone: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;
  return (
    <div className="mt-5 rounded-[3px] border border-accent-line bg-accent-soft px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-fg">Get a text when {sellerName} replies</p>
        <button
          type="button"
          onClick={() => {
            setShow(false);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // fine: hidden for now
            }
          }}
          className="link-quiet -mt-0.5 shrink-0 text-xs"
        >
          Not now
        </button>
      </div>
      <p className="mt-0.5 text-xs text-fg-secondary">So you don&apos;t miss their answer. You can reply by text, too.</p>
      <div className="mt-2">
        <SmsSettings enabledPhone={null} defaultPhone={defaultPhone} />
      </div>
    </div>
  );
}
