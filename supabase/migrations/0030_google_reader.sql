-- The Google account brokers share private sheets with (sheets@idriveus.com):
-- an admin connects it once at /admin/google-reader, and its refresh token
-- lets the server read any sheet shared with that address (view-only).
--
-- One row. Only the server reads or writes it (service role): RLS on, no
-- policies.
--
-- Safe to re-run.
create table if not exists public.google_reader (
  id smallint primary key default 1,
  email text not null,
  refresh_token text not null,
  connected_by text,
  updated_at timestamptz not null default now(),
  constraint google_reader_single_row check (id = 1)
);

alter table public.google_reader enable row level security;
