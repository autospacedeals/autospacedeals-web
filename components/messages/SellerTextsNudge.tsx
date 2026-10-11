"use client";

// On the seller dashboard while texts are off: the "Text me new messages"
// setting, highlighted, with why it matters (and a plainer warning when
// their message emails are off too, so they'd hear about nothing). "Not
// now" turns it back into the plain setting on this device.
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import SmsSettings from "@/components/messages/SmsSettings";

const DISMISS_KEY = "drive_seller_texts_nudge_dismissed";

export default function SellerTextsNudge({ defaultPhone, emailsOn }: { defaultPhone: string; emailsOn: boolean }) {
  const [nudge, setNudge] = useState(true);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(DISMISS_KEY) === "1") setNudge(false);
    } catch {
      // keep showing it
    }
  }, []);

  if (!nudge) return <SmsSettings enabledPhone={null} defaultPhone={defaultPhone} />;
  return (
    <div className={`rounded-xl border px-4 py-3 ${emailsOn ? "border-accent-line bg-accent-soft" : "border-warning bg-warning-soft"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <BellRing className="size-4 shrink-0" /> Don&apos;t miss a shopper: turn on texts
        </p>
        <button
          type="button"
          onClick={() => {
            setNudge(false);
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
      <p className="mt-1 text-xs leading-5 text-fg-secondary">
        {emailsOn
          ? "Shoppers who hear back fast are the ones who sign. Get a text the moment someone messages you, and reply right from your phone."
          : "Right now you won't hear about new messages at all: your message emails are off. Turn on texts (or emails) so shoppers don't go unanswered."}
      </p>
      <div className="mt-3">
        <SmsSettings enabledPhone={null} defaultPhone={defaultPhone} />
      </div>
    </div>
  );
}
