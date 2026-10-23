"use client";

// Quiet hours for text alerts, under "Text me new messages" once texts are
// on: a daily window when new-message texts are held, then sent as one
// text when it ends (lib/quiet-hours.ts). Emails aren't affected. Saved in
// the browser's own time zone.
import { useState, useTransition } from "react";
import { Moon } from "lucide-react";
import { saveQuietHoursAction } from "@/app/messages/sms-actions";
import { DEFAULT_QUIET, QUIET_TIMES, formatQuietTime, zoneName, type QuietHours } from "@/lib/quiet-hours";

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Los_Angeles";
  }
};

export default function QuietHoursSettings({ initial }: { initial: QuietHours | null }) {
  const [on, setOn] = useState(initial != null);
  const [start, setStart] = useState(initial?.start ?? DEFAULT_QUIET.start);
  const [end, setEnd] = useState(initial?.end ?? DEFAULT_QUIET.end);
  const [zone, setZone] = useState(initial?.timeZone ?? null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: { on: boolean; start: number; end: number }) => {
    setError(null);
    setSaved(false);
    const timeZone = browserZone();
    startTransition(async () => {
      try {
        const r = await saveQuietHoursAction(next.on ? { start: next.start, end: next.end, timeZone } : null);
        if (r.ok) {
          setSaved(true);
          setZone(next.on ? timeZone : null);
        } else setError(r.error);
      } catch (err) {
        console.error("Quiet hours save threw:", err);
        setError("Something went wrong — please try again.");
      }
    });
  };

  const picker = (label: string, value: number, onChange: (v: number) => void) => (
    <label className="flex items-center gap-2">
      <span className="text-fg-muted">{label}</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => onChange(Number(e.target.value))}
        className="select select-sm"
      >
        {QUIET_TIMES.map((m) => (
          <option key={m} value={m}>
            {formatQuietTime(m)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mt-3 border-t border-line pt-3">
      <label className="flex cursor-pointer items-center gap-2.5 font-medium text-fg">
        <input
          type="checkbox"
          className="checkbox"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            setOn(e.target.checked);
            save({ on: e.target.checked, start, end });
          }}
        />
        <Moon size={15} className="text-fg-muted" /> Quiet hours
      </label>
      <p className="mt-1 text-xs leading-5 text-fg-muted">
        Hold texts overnight. Messages that come in during these hours are sent as one text when they end. Emails
        still arrive right away.
      </p>
      {on && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          {picker("From", start, (v) => {
            setStart(v);
            if (v !== end) save({ on: true, start: v, end });
            else setError("Pick a start and end time that aren't the same.");
          })}
          {picker("to", end, (v) => {
            setEnd(v);
            if (v !== start) save({ on: true, start, end: v });
            else setError("Pick a start and end time that aren't the same.");
          })}
          {zone && <span className="text-xs text-fg-muted">{zoneName(zone)} time</span>}
        </div>
      )}
      <p aria-live="polite" className="mt-1.5 min-h-4 text-xs">
        {pending ? (
          <span className="text-fg-muted">Saving…</span>
        ) : error ? (
          <span className="field-error">{error}</span>
        ) : saved ? (
          <span className="text-success">
            {on ? `Saved — texts wait from ${formatQuietTime(start)} to ${formatQuietTime(end)}.` : "Quiet hours off."}
          </span>
        ) : null}
      </p>
    </div>
  );
}
