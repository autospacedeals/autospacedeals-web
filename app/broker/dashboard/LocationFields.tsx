"use client";

import { DELIVERY_OPTIONS, US_STATE_CODES, type DeliveryOption } from "@/lib/deal-location";

export interface LocationValue {
  city: string;
  state: string;
  delivery: DeliveryOption | "";
}

// Where this car is and whether it ships — its own, since a broker can
// have cars in several places. Submits `city`, `state` and `delivery`.
// Controlled when `onChange` is given (the live-listing editor builds its
// own FormData); otherwise plain defaults inside a <form>. A blank value
// falls back to the broker's own city/state on the server where allowed.
export default function LocationFields({
  idPrefix,
  value,
  onChange,
  cityPlaceholder = "SoCal",
}: {
  idPrefix: string;
  value: LocationValue;
  onChange?: (value: LocationValue) => void;
  cityPlaceholder?: string;
}) {
  const field = <K extends keyof LocationValue>(key: K) =>
    onChange
      ? { value: value[key], onChange: (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value }) }
      : { defaultValue: value[key] };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
        <div>
          <label htmlFor={`${idPrefix}-city`} className="field-label">
            City or region
          </label>
          <input
            id={`${idPrefix}-city`}
            name="city"
            maxLength={60}
            placeholder={cityPlaceholder}
            className="input"
            {...field("city")}
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-state`} className="field-label">
            State
          </label>
          <select id={`${idPrefix}-state`} name="state" className="select" {...field("state")}>
            <option value="">—</option>
            {US_STATE_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-delivery`} className="field-label">
            Delivery (optional)
          </label>
          <select id={`${idPrefix}-delivery`} name="delivery" className="select" {...field("delivery")}>
            <option value="">Not stated</option>
            {DELIVERY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="field-hint">Where this car is, if it&apos;s not where you are, and whether you can get it to buyers elsewhere.</p>
    </div>
  );
}
