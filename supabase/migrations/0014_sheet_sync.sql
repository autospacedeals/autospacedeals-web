-- Recurring Google Sheet sync: a broker can mark a linked Google Sheet as
-- "keep synced," and a scheduled job (see app/api/cron/sync-sheets) re-checks
-- it periodically — adding new cars it finds (as drafts, or published
-- directly if the broker opted into auto-publish) and soft-removing cars
-- that disappear from the sheet, the same way a manual removal works today
-- (status 'removed', restorable from the broker's "Removed" list).
create table if not exists public.sheet_syncs (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers (id) on delete cascade,
  sheet_url text not null,
  auto_publish boolean not null default false,
  active boolean not null default true,
  last_synced_at timestamptz,
  last_sync_added integer not null default 0,
  last_sync_removed integer not null default 0,
  last_sync_error text,
  created_at timestamptz not null default now()
);

alter table public.sheet_syncs enable row level security;

create policy "Brokers can view their own sheet syncs"
  on public.sheet_syncs for select
  using (auth.uid() = broker_id);

create policy "Brokers can insert their own sheet syncs"
  on public.sheet_syncs for insert
  with check (auth.uid() = broker_id);

create policy "Brokers can update their own sheet syncs"
  on public.sheet_syncs for update
  using (auth.uid() = broker_id);

create policy "Brokers can delete their own sheet syncs"
  on public.sheet_syncs for delete
  using (auth.uid() = broker_id);

-- Ties a deal back to the sheet sync that created it (null for anything
-- added manually, via a one-off upload, screenshot, or pasted text), and
-- stores the signature (year|make|model|trim|payment|dueAtSigning) used to
-- match a sheet row to an existing listing across sync runs.
alter table public.deals add column if not exists sheet_sync_id uuid references public.sheet_syncs (id) on delete set null;
alter table public.deals add column if not exists match_signature text;

create index if not exists sheet_syncs_broker_id_idx on public.sheet_syncs (broker_id);
create index if not exists deals_sheet_sync_id_idx on public.deals (sheet_sync_id);
