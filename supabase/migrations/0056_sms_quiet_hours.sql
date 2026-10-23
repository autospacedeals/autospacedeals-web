-- Quiet hours for text alerts (lib/quiet-hours.ts): an account with texts on
-- can pick a daily window (e.g. 10 PM to 8 AM, in its own time zone) when
-- new-message texts are held instead of sent. Held texts wait in sms_held;
-- /api/cron/sms-catchup sends one catch-up text when the window ends.
-- Emails aren't affected.
--
-- Safe to re-run.
alter table public.sms_settings
  -- Minutes after midnight, local time; both null = quiet hours off.
  add column if not exists quiet_start smallint check (quiet_start is null or quiet_start between 0 and 1439),
  add column if not exists quiet_end smallint check (quiet_end is null or quiet_end between 0 and 1439),
  -- IANA zone the window is in ("America/Los_Angeles"), from the browser
  -- that saved it.
  add column if not exists time_zone text;

-- One row per message that wasn't texted because of quiet hours. Written and
-- read only by the server (service role), so no policies.
create table if not exists public.sms_held (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_name text not null,
  deal_label text,
  snippet text not null,
  created_at timestamptz not null default now()
);

create index if not exists sms_held_user_idx on public.sms_held (user_id, created_at);

alter table public.sms_held enable row level security;

-- Every 5 minutes: send the catch-up text to anyone whose quiet hours have
-- ended. cron.schedule() with an existing job name replaces it.
select cron.schedule(
  'drive-sms-catchup',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://www.idriveus.com/api/cron/sms-catchup',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
