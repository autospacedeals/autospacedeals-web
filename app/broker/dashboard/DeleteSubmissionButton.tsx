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
        <button type="submit" className="btn btn-danger btn-sm">
          <Trash2 /> Delete
        </button>
      </form>
      {error && <p className="mt-1 max-w-[160px] text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
