-- Admins get an email when a synced sheet needs a look (lib/sheet-sync.ts):
-- removals held back by the large-drop guard, rows the AI couldn't read,
-- or a new tab (new tabs start switched off). last_alert_key is what was
-- last reported, so the same problem isn't emailed every 30 minutes.
--
-- Safe to re-run.

alter table public.sheet_syncs add column if not exists last_alert_key text;
