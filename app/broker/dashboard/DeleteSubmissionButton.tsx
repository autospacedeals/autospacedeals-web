"use client";

import { Trash2 } from "lucide-react";
import { deleteSubmissionAction } from "./actions";

export default function DeleteSubmissionButton({ id }: { id: string }) {
  return (
    <form
      action={async (formData) => {
        if (typeof window !== "undefined" && !window.confirm("Delete this submission? This can't be undone.")) {
          return;
        }
        await deleteSubmissionAction(formData);
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
  );
}
