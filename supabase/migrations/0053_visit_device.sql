-- What kind of device each counted visit came from: mobile, tablet or
-- desktop, worked out from the browser's user agent when the visit is
-- recorded (app/api/track/route.ts). Only the one word is stored, not the
-- user agent. Shown on /admin/leads. Visits recorded before this migration
-- have no device.
--
-- Safe to re-run.
alter table public.site_visits add column if not exists device text;

do $$
begin
  alter table public.site_visits
    add constraint site_visits_device_check check (device is null or device in ('mobile', 'tablet', 'desktop'));
exception
  when duplicate_object then null;
end $$;
