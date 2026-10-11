-- When each signed-in account was last on the site (Admin -> Users, "Last
-- on site"). Updated by a light ping from any page while signed in, at most
-- every 10 minutes (components/SeenPing.tsx -> app/api/seen). Server-only.
--
-- Safe to re-run.

create table if not exists public.account_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.account_activity enable row level security;
-- No policies on purpose: only the service role uses this table.
