"use client";

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { refreshSamplePhotosAction } from "./actions";

// One-off maintenance control — re-fetches CarsXE photos for the
// sample/demo listings only. Not something that needs to run often, so it's
// a manual button rather than anything automatic.
export default function RefreshSamplePhotosButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleClick() {
    setRunning(true);
    setResult(null);
    try {
      const res = await refreshSamplePhotosAction();
      if (res.error) {
        setResult(`Failed: ${res.error}`);
      } else {
        setResult(
          `Updated ${res.updated} of ${res.total} sample listings (${res.noMatch} had no CarsXE match).`
        );
      }
    } catch {
      setResult("Failed — try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={running}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <ImageDown size={14} />}
        {running ? "Refreshing sample photos..." : "Refresh sample listing photos"}
      </button>
      {result && <p className="text-xs text-zinc-500">{result}</p>}
    </div>
  );
}
