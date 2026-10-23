// Quiet hours for text alerts (supabase/migrations/0056_sms_quiet_hours.sql):
// a daily window, in the account's own time zone, when new-message texts
// are held and then sent as one catch-up text (app/api/cron/sms-catchup).
// Times are minutes after midnight; a window can run past midnight
// (10 PM → 8 AM).
import { DRIVE_TZ } from "@/lib/time";

export interface QuietHours {
  start: number;
  end: number;
  timeZone: string;
}

// What a broker gets when they first turn quiet hours on.
export const DEFAULT_QUIET: { start: number; end: number } = { start: 22 * 60, end: 8 * 60 };

// Every half hour, for the start/end pickers.
export const QUIET_TIMES = Array.from({ length: 48 }, (_, i) => i * 30);

export function validTimeZone(tz: string | null | undefined): string {
  if (!tz) return DRIVE_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DRIVE_TZ;
  }
}

// The saved window, or null when quiet hours are off.
export function quietHoursOf(row: {
  quiet_start?: number | null;
  quiet_end?: number | null;
  time_zone?: string | null;
} | null): QuietHours | null {
  if (!row || row.quiet_start == null || row.quiet_end == null || row.quiet_start === row.quiet_end) return null;
  return { start: row.quiet_start, end: row.quiet_end, timeZone: validTimeZone(row.time_zone) };
}

// Minutes after midnight right now in that zone.
function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function inQuietHours(q: QuietHours | null, now = new Date()): boolean {
  if (!q) return false;
  const m = localMinutes(now, q.timeZone);
  return q.start < q.end ? m >= q.start && m < q.end : m >= q.start || m < q.end;
}

// "10:00 PM"
export function formatQuietTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "Pacific", "Eastern"… for showing which zone the window is in.
export function zoneName(timeZone: string): string {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return name ? name.replace(/ (Standard|Daylight) Time$/, "").replace(/ Time$/, "") : timeZone;
  } catch {
    return timeZone;
  }
}
