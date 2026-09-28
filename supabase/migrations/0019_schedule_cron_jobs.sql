-- Runs the site's two recurring jobs from Supabase itself (pg_cron + pg_net)
-- instead of GitHub Actions, whose free scheduler delays and skips frequent
-- schedules (the "every 30 minutes" sheet sync was really running every
-- 3-6 hours):
--   drive-sync-sheets    every 30 min  → /api/cron/sync-sheets
--   drive-search-alerts  hourly at :17 → /api/cron/search-alerts
--
-- BEFORE running this, store the same value as Vercel's CRON_SYNC_SECRET in
-- Supabase Vault (once — it stays encrypted there and never lives in the
-- repo). In the SQL editor:
--
--   select vault.create_secret('PASTE-THE-SECRET-HERE', 'cron_sync_secret');
--
-- (To change it later: select vault.update_secret(
--    (select id from vault.secrets where name = 'cron_sync_secret'), 'NEW-VALUE');)
--
-- Safe to re-run: cron.schedule() with an existing job name replaces it.
-- To check it's working:
--   select jobname, schedule, active from cron.job;
--   select jobname, status, start_time from cron.job_run_details
--     join cron.job using (jobid) order by start_time desc limit 10;
--   select status_code, left(content, 200), created from net._http_response
--     order by created desc limit 10;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'drive-sync-sheets',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := 'https://www.idriveus.com/api/cron/sync-sheets',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'drive-search-alerts',
  '17 * * * *',
  $$
  select net.http_get(
    url := 'https://www.idriveus.com/api/cron/search-alerts',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
