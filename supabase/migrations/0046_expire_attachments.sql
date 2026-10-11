-- Message photos and files disappear for privacy: 15 minutes after the
-- person they were sent to first opens them, or a week after sending if
-- they never do (lib/message-attachments.ts). This runs the cleanup that
-- deletes them from storage every 5 minutes; the viewer stops serving
-- them on time regardless.
--
-- Safe to re-run: cron.schedule() with an existing job name replaces it.
select cron.schedule(
  'drive-expire-attachments',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://www.idriveus.com/api/cron/expire-attachments',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
