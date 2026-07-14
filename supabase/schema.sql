-- =============================================================================
-- AutoSpace Deals — Broker Portal Schema
-- =============================================================================
-- Run this once in your Supabase project's SQL Editor (Project → SQL Editor →
-- New query → paste this whole file → Run). It creates:
--   1. brokers        — one row per broker/dealer account (linked to Supabase Auth)
--   2. submissions     — the queue of links/sheets/files a broker has submitted
--                        for you to review and manually add to the site
-- Row Level Security (RLS) is enabled so a broker can only ever see and edit
-- their own rows. Admin review (seeing everyone's submissions) is done with
-- the service role key from server code only — never exposed to the browser.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- brokers
-- -----------------------------------------------------------------------------
create table if not exists public.brokers (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null,
  seller_type text not null check (seller_type in ('Dealer', 'Broker')),
  contact_phone text not null,
  city text not null,
  state text not null,
  created_at timestamptz not null default now()
);

alter table public.brokers enable row level security;

create policy "Brokers can view their own profile"
  on public.brokers for select
  using (auth.uid() = id);

create policy "Brokers can update their own profile"
  on public.brokers for update
  using (auth.uid() = id);

create policy "Brokers can insert their own profile"
  on public.brokers for insert
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- submissions
-- -----------------------------------------------------------------------------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  broker_id uuid not null references public.brokers (id) on delete cascade,
  source_type text not null check (source_type in ('link', 'google_sheet', 'excel_file')),
  source_url text not null, -- forum/website URL, Google Sheet share link, or Supabase Storage file path
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.submissions enable row level security;

create policy "Brokers can view their own submissions"
  on public.submissions for select
  using (auth.uid() = broker_id);

create policy "Brokers can insert their own submissions"
  on public.submissions for insert
  with check (auth.uid() = broker_id);

-- Brokers do NOT get an update/delete policy — once submitted, only the admin
-- (via the service role key, server-side) can change status. This keeps the
-- review trail trustworthy.

-- -----------------------------------------------------------------------------
-- Storage bucket for Excel file uploads
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('broker-uploads', 'broker-uploads', false)
on conflict (id) do nothing;

create policy "Brokers can upload their own files"
  on storage.objects for insert
  with check (
    bucket_id = 'broker-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Brokers can view their own uploaded files"
  on storage.objects for select
  using (
    bucket_id = 'broker-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
