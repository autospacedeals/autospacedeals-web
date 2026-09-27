"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateBrokerAboutAction } from "./actions";

export default function AboutEditor({ about, brokerId }: { about: string | null; brokerId: string }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="panel mt-6">
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
