"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { updateBrokerAboutAction } from "./actions";

export default function AboutEditor({ about, brokerId }: { about: string | null; brokerId: string }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-300">About your business</p>
            <p className="mt-1 text-sm text-zinc-500">
              {about || "Nothing written yet — add a short blurb shoppers see on your public profile page."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <Pencil size={13} /> Edit
          </button>
        </div>
        <a
          href={`/brokers/${brokerId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs font-semibold text-zinc-500 underline decoration-dotted hover:text-white"
        >
          View your public profile
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/20 bg-white/[0.05] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-300">About your business</p>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-zinc-500 hover:text-white"
          aria-label="Cancel"
        >
          <X size={16} />
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
          defaultValue={about ?? ""}
          placeholder="A few sentences about your business — how long you've been around, what you specialize in, why shoppers should work with you."
          className="min-h-28 w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
        />
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
        >
          Save
        </button>
      </form>
    </div>
  );
}
