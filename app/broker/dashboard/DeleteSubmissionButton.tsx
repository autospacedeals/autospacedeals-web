"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteSubmissionAction } from "./actions";

export default function DeleteSubmissionButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <form
        action={async (formData) => {
          if (typeof window !== "undefined" && !window.confirm("Delete this submission? This can't be undone.")) {
            return;
          }
          setError(null);
          const result = await deleteSubmissionAction(formData);
          if (result.error) setError(result.error);
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition hover:text-red-400"
        >
          <Trash2 size={12} /> Delete
        </button>
      </form>
      {error && <p className="mt-1 max-w-[160px] text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}
