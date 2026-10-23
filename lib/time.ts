// Dates and times on Drive are shown in the viewer's own time zone. Pages
// render on Vercel's servers, which run on UTC and don't know where the
// viewer is, so a time formatted there with no zone comes out in UTC (a
// 9:57 PM message read as 4:57 AM). Instead, <LocalTime> (components/
// LocalTime.tsx) formats in the browser's zone; DRIVE_TZ, Pacific, is only
// the first guess while the page loads, and the zone for emails.
export const DRIVE_TZ = "America/Los_Angeles";

export type WhenStyle =
  | "date" // Oct 3
  | "date-year" // Oct 3, 2026
  | "datetime-year" // Oct 22, 2026, 6:34 PM
  | "time-or-date" // 4:57 PM today, otherwise Oct 3
  | "time-or-datetime" // 4:57 PM today, otherwise Oct 3, 4:57 PM
  | "seen"; // Today, 3:42 PM / Yesterday / Oct 4, 2026

const OPTIONS: Record<Exclude<WhenStyle, "time-or-date" | "time-or-datetime" | "seen">, Intl.DateTimeFormatOptions> = {
  date: { month: "short", day: "numeric" },
  "date-year": { month: "short", day: "numeric", year: "numeric" },
  "datetime-year": { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
};

// Whether two moments fall on the same calendar day in a time zone.
export function sameDay(a: Date, b: Date, timeZone: string): boolean {
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone });
  return day(a) === day(b);
}

export function formatWhen(iso: string, style: WhenStyle, timeZone: string = DRIVE_TZ, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = () => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  switch (style) {
    case "time-or-date":
      return sameDay(d, now, timeZone) ? time() : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
    case "time-or-datetime":
      return sameDay(d, now, timeZone)
        ? time()
        : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
    case "seen":
      if (sameDay(d, now, timeZone)) return `Today, ${time()}`;
      if (sameDay(d, new Date(now.getTime() - 86400000), timeZone)) return "Yesterday";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
    default:
      return d.toLocaleString("en-US", { ...OPTIONS[style], timeZone });
  }
}
