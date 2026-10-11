-- A seller who hits the listing assistant's daily message cap
-- (lib/listing-assistant.ts DAILY_MESSAGE_LIMIT) can ask for more. Admins
-- are emailed and approve or deny on Admin → Users; an approval adds
-- `extra` messages for the next 24 hours.
--
-- Server-only: RLS on with no policies; the app reads and writes it with
-- the service role.
--
-- Safe to re-run.

create table if not exists public.listing_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  extra integer not null default 40 check (extra > 0),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists listing_assistant_requests_broker_created
  on public.listing_assistant_requests (broker_id, created_at desc);

alter table public.listing_assistant_requests enable row level security;
revoke all on public.listing_assistant_requests from anon, authenticated;
