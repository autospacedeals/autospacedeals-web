-- Lead tracking for the admin Leads page (/admin/leads): where shoppers
-- came from, how fast brokers reply, and which conversations ended in a sale.
--
--   site_visits             — first-party visit log: one row per visit to
--                             the site (kind 'landing') and per listing view
--                             ('listing'), with how the visitor found us
--                             (utm_source / ad click id / referring site).
--                             Written and read only by the server.
--   customers.signup_*      — how a shopper found us when they signed up.
--   conversations.source/campaign — the same, when they messaged a seller.
--   conversations.first_broker_reply_at — kept by the messages trigger.
--   conversations.outcome   — the broker's (or an admin's) answer to "did
--                             this one sell?": sold / working / lost.
--   conversations.outcome_asked_at — when the broker was last emailed the
--                             check-in (/api/cron/lead-checkins).
--
-- Also schedules that daily check-in email (needs the same Vault secret as
-- 0019_schedule_cron_jobs.sql).
--
-- Safe to re-run.

-- -----------------------------------------------------------------------------
-- 1. Visits
-- -----------------------------------------------------------------------------
create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  -- Random id from a first-party cookie (drive_vid), not tied to an account.
  visitor text not null check (char_length(visitor) between 8 and 64),
  kind text not null check (kind in ('landing', 'listing')),
  path text not null default '' check (char_length(path) <= 300),
  deal_id uuid references public.deals (id) on delete set null,
  broker_id uuid references public.brokers (id) on delete set null,
  source text check (source is null or char_length(source) <= 80),
  campaign text check (campaign is null or char_length(campaign) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists site_visits_created_idx on public.site_visits (created_at desc);
create index if not exists site_visits_deal_idx on public.site_visits (deal_id, created_at desc);
create index if not exists site_visits_visitor_idx on public.site_visits (visitor, created_at desc);

alter table public.site_visits enable row level security;
-- No policies on purpose: only the service role uses this table.

-- -----------------------------------------------------------------------------
-- 2. Where shoppers and conversations came from
-- -----------------------------------------------------------------------------
alter table public.customers add column if not exists signup_source text;
alter table public.customers add column if not exists signup_campaign text;

alter table public.conversations add column if not exists source text;
alter table public.conversations add column if not exists campaign text;

-- -----------------------------------------------------------------------------
-- 3. Reply times and outcomes
-- -----------------------------------------------------------------------------
alter table public.conversations add column if not exists first_broker_reply_at timestamptz;
alter table public.conversations add column if not exists outcome text;
alter table public.conversations add column if not exists outcome_at timestamptz;
alter table public.conversations add column if not exists outcome_asked_at timestamptz;

do $$
begin
  alter table public.conversations
    add constraint conversations_outcome_check check (outcome is null or outcome in ('sold', 'working', 'lost'));
exception
  when duplicate_object then null;
end;
$$;

-- Shoppers and brokers read their conversations through the public API;
-- the lead columns above (source, outcome, ...) are Drive's business only,
-- so they're left out of what those accounts can select. The server reads
-- them with the service role.
revoke select on public.conversations from anon, authenticated;
grant select (
  id, customer_id, broker_id, deal_id, deal_label, created_at, last_message_at, last_message_preview,
  last_sender_role, customer_last_read_at, broker_last_read_at, customer_notified_at, broker_notified_at
) on public.conversations to authenticated;

create index if not exists conversations_created_idx on public.conversations (created_at desc);

update public.conversations c
   set first_broker_reply_at = (
     select min(m.created_at) from public.messages m
      where m.conversation_id = c.id and m.sender_role = 'broker'
   )
 where c.first_broker_reply_at is null;

-- Same as 0024's trigger, plus first_broker_reply_at.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(regexp_replace(new.body, '\s+', ' ', 'g'), 140),
         last_sender_role = new.sender_role,
         customer_last_read_at = case when new.sender_role = 'customer' then new.created_at else customer_last_read_at end,
         broker_last_read_at = case when new.sender_role = 'broker' then new.created_at else broker_last_read_at end,
         first_broker_reply_at = case
           when new.sender_role = 'broker' then coalesce(first_broker_reply_at, new.created_at)
           else first_broker_reply_at
         end
   where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.messages_after_insert() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Daily "did these sell?" check-in to brokers, 10am Pacific (17:00 UTC)
-- -----------------------------------------------------------------------------
select cron.schedule(
  'drive-lead-checkins',
  '0 17 * * *',
  $$
  select net.http_get(
    url := 'https://www.idriveus.com/api/cron/lead-checkins',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_sync_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
