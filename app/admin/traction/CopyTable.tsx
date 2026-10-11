"use client";

// "Copy" for a traction table: tab-separated, so it pastes straight into a
// spreadsheet or pitch deck as cells.
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyTable({ rows }: { rows: (string | number)[][] }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(rows.map((r) => r.join("\t")).join("\n"));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // clipboard blocked; nothing to do
        }
      }}
      className="btn btn-ghost btn-sm"
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy for a spreadsheet"}
    </button>
  );
}
