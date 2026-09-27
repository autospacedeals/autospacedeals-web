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
    <div className="card mt-4 flex flex-wrap items-center gap-3 p-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={running}
        className="btn btn-secondary btn-sm"
      >
        {running ? <Loader2 className="animate-spin" /> : <ImageDown />}
        {running ? "Refreshing sample photos..." : "Refresh sample listing photos"}
      </button>
      {result && (
        <p className={`text-xs ${result.startsWith("Failed") ? "text-danger" : "text-success"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
