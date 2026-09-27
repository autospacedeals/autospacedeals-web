"use client";

import { useState } from "react";
import { MapPin, Car, IdCard, ShieldCheck, Pencil, X, ExternalLink } from "lucide-react";
import { updateCustomerProfileAction } from "./actions";

const inputClass = "input";
const labelClass = "field-label";
const fileInputClass = "file-input";

interface ProfileEditorProps {
  firstName: string;
  lastName: string;
  zipCode: string;
  address: string | null;
  currentVehicle: string | null;
  hasLicense: boolean;
  hasInsurance: boolean;
  licenseUrl: string | null;
  insuranceUrl: string | null;
}

export default function ProfileEditor({
  firstName,
  lastName,
  zipCode,
  address,
  currentVehicle,
  hasLicense,
  hasInsurance,
  licenseUrl,
  insuranceUrl,
}: ProfileEditorProps) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="mt-5 space-y-4 border-t border-line pt-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="label">Additional info</p>
          <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary btn-sm">
            <Pencil /> Edit
          </button>
        </div>

        <dl className="space-y-4">
          <div>
            <dt className="label flex items-center gap-1.5">
              <MapPin size={13} className="text-fg-faint" /> Address
            </dt>
            <dd className="mt-1 wrap-anywhere text-fg-secondary">{address || "Not added"}</dd>
          </div>
          <div>
            <dt className="label flex items-center gap-1.5">
              <Car size={13} className="text-fg-faint" /> Current vehicle
            </dt>
            <dd className="mt-1 wrap-anywhere text-fg-secondary">{currentVehicle || "Not added"}</dd>
          </div>
          <div>
            <dt className="label flex items-center gap-1.5">
              <IdCard size={13} className="text-fg-faint" /> Driver&apos;s license
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-fg-secondary">
              {hasLicense ? "Uploaded" : "Not added"}
              {licenseUrl && (
                <a
                  href={licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link inline-flex items-center gap-1 text-xs"
                >
                  View <ExternalLink size={11} />
                </a>
              )}
            </dd>
          </div>
          <div>
            <dt className="label flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-fg-faint" /> Insurance / AAA card
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-fg-secondary">
              {hasInsurance ? "Uploaded" : "Not added"}
              {insuranceUrl && (
                <a
                  href={insuranceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link inline-flex items-center gap-1 text-xs"
                >
                  View <ExternalLink size={11} />
                </a>
              )}
            </dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="label">Additional info</p>
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
          setPending(true);
          setError(null);
          const result = await updateCustomerProfileAction(formData);
          setPending(false);
          if (result.error) setError(result.error);
          else setEditing(false);
        }}
        className="mt-4 space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="profile-first-name" className={labelClass}>
              First name
            </label>
            <input
              id="profile-first-name"
              name="firstName"
              defaultValue={firstName}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="profile-last-name" className={labelClass}>
              Last name
            </label>
            <input
              id="profile-last-name"
              name="lastName"
              defaultValue={lastName}
              required
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="profile-zip-code" className={labelClass}>
            Zip code
          </label>
          <input
            id="profile-zip-code"
            name="zipCode"
            defaultValue={zipCode}
            required
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-address" className={labelClass}>
            Address
          </label>
          <input
            id="profile-address"
            name="address"
            defaultValue={address ?? ""}
            placeholder="123 Main St, Los Angeles, CA"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-current-vehicle" className={labelClass}>
            Current vehicle
          </label>
          <input
            id="profile-current-vehicle"
            name="currentVehicle"
            defaultValue={currentVehicle ?? ""}
            placeholder="2023 Honda Accord, lease ends March 2027"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-drivers-license" className={labelClass}>
            Driver&apos;s license (photo){hasLicense && " — already on file"}
          </label>
          <input
            id="profile-drivers-license"
            type="file"
            name="driversLicense"
            accept="image/*"
            className={fileInputClass}
          />
        </div>
        <div>
          <label htmlFor="profile-insurance-card" className={labelClass}>
            Insurance / AAA card (photo){hasInsurance && " — already on file"}
          </label>
          <input
            id="profile-insurance-card"
            type="file"
            name="insuranceCard"
            accept="image/*"
            className={fileInputClass}
          />
        </div>
        <p className="field-hint">
          Only choose a file here if you want to replace what&apos;s already on file — leave it blank
          to keep your current upload.
        </p>

        {error && (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
