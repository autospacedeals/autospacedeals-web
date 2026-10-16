"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Pencil, Trash2, X } from "lucide-react";
import SellerAvatar from "@/components/SellerAvatar";
import { removeBrokerLogoAction, updateBrokerAboutAction, uploadBrokerLogoAction } from "./actions";

// The seller's logo: shown instead of their initials on their deal pages and
// public profile. Picking a file uploads it right away.
function LogoEditor({ businessName, logoUrl }: { businessName: string; logoUrl: string | null }) {
  const [logo, setLogo] = useState(logoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-4">
      <SellerAvatar name={businessName} logoUrl={logo} className="size-14 text-base" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">Your logo</p>
        <p className="text-xs text-fg-muted">
          Shown instead of your initials on your listings and profile. A square PNG with a transparent
          background looks best.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            aria-label="Upload your logo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError(null);
              startTransition(async () => {
                const data = new FormData();
                data.set("logo", file);
                const result = await uploadBrokerLogoAction(data);
                if (result.error) setError(result.error);
                else if (result.logoUrl) setLogo(result.logoUrl);
              });
            }}
          />
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="btn btn-secondary btn-sm">
            <ImageUp /> {pending ? "Uploading…" : logo ? "Change logo" : "Upload logo"}
          </button>
          {logo && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await removeBrokerLogoAction();
                  if (result.error) setError(result.error);
                  else setLogo(null);
                });
              }}
              className="btn btn-ghost btn-sm"
            >
              <Trash2 /> Remove
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default function AboutEditor({
  about,
  brokerId,
  businessName,
  logoUrl,
}: {
  about: string | null;
  brokerId: string;
  businessName: string;
  logoUrl: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="panel mt-6">
        <LogoEditor businessName={businessName} logoUrl={logoUrl} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-title">About your business</p>
            <p className="mt-1 text-sm break-words text-fg-secondary">
              {about || "Nothing written yet — add a short blurb shoppers see on your public profile page."}
            </p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary btn-sm">
            <Pencil /> Edit
          </button>
        </div>
        <a
          href={`/brokers/${brokerId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link-quiet mt-3 inline-block text-xs font-medium underline decoration-dotted underline-offset-4"
        >
          View your public profile
        </a>
      </div>
    );
  }

  return (
    <div className="panel mt-6 border-line-strong">
      <div className="flex items-center justify-between gap-3">
        <p className="type-title">About your business</p>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn btn-ghost btn-icon btn-sm -mr-2"
          aria-label="Cancel"
        >
          <X />
        </button>
      </div>

      <form
        action={async (formData) => {
          setError(null);
          const result = await updateBrokerAboutAction(formData);
          if (result.error) setError(result.error);
          else setEditing(false);
        }}
        className="mt-3 space-y-3"
      >
        <textarea
          name="about"
          aria-label="About your business"
          defaultValue={about ?? ""}
          placeholder="A few sentences about your business — how long you've been around, what you specialize in, why shoppers should work with you."
          className="textarea min-h-28 resize-y"
        />
        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-sm">
          Save
        </button>
      </form>
    </div>
  );
}
