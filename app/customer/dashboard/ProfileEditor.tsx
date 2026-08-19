"use client";

import { useState } from "react";
import { MapPin, Car, IdCard, ShieldCheck, Pencil, X } from "lucide-react";
import { updateCustomerProfileAction } from "./actions";

const inputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-white/30 focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-zinc-400";
const fileInputClass =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/20";

interface ProfileEditorProps {
  address: string | null;
  currentVehicle: string | null;
  hasLicense: boolean;
  hasInsurance: boolean;
}

export default function ProfileEditor({
  address,
  currentVehicle,
  hasLicense,
  hasInsurance,
}: ProfileEditorProps) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="mt-4 space-y-4 border-t border-white/10 pt-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-500">Additional info</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
          >
            <Pencil size={12} /> Edit
          </button>
        </div>

        <div>
          <dt className="flex items-center gap-1.5 text-zinc-500">
            <MapPin size={13} /> Address
          </dt>
          <dd className="mt-0.5 text-zinc-300">{address || "Not added"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-zinc-500">
            <Car size={13} /> Current vehicle
          </dt>
          <dd className="mt-0.5 text-zinc-300">{currentVehicle || "Not added"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-zinc-500">
            <IdCard size={13} /> Driver&apos;s license
          </dt>
          <dd className="mt-0.5 text-zinc-300">{hasLicense ? "Uploaded" : "Not added"}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-zinc-500">
            <ShieldCheck size={13} /> Insurance / AAA card
          </dt>
          <dd className="mt-0.5 text-zinc-300">{hasInsurance ? "Uploaded" : "Not added"}</dd>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-500">Additional info</p>
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
          setPending(true);
          setError(null);
          const result = await updateCustomerProfileAction(formData);
          setPending(false);
          if (result.error) setError(result.error);
          else setEditing(false);
        }}
        className="mt-3 space-y-4"
      >
        <div>
          <label className={labelClass}>Address</label>
          <input
            name="address"
            defaultValue={address ?? ""}
            placeholder="123 Main St, Los Angeles, CA"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Current vehicle</label>
          <input
            name="currentVehicle"
            defaultValue={currentVehicle ?? ""}
            placeholder="2023 Honda Accord, lease ends March 2027"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Driver&apos;s license (photo){hasLicense && " — already on file"}
          </label>
          <input type="file" name="driversLicense" accept="image/*" className={fileInputClass} />
        </div>
        <div>
          <label className={labelClass}>
            Insurance / AAA card (photo){hasInsurance && " — already on file"}
          </label>
          <input type="file" name="insuranceCard" accept="image/*" className={fileInputClass} />
        </div>
        <p className="text-xs text-zinc-600">
          Only choose a file here if you want to replace what's already on file — leave it blank
          to keep your current upload.
        </p>

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
