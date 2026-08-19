-- Customer accounts — mirrors the brokers table pattern (Supabase Auth +
-- profile table + RLS so a customer can only ever see/edit their own row).
--
-- Required at signup: first_name, last_name, zip_code.
-- Optional: address, current_vehicle (free text, e.g. "2023 Honda Accord,
-- lease ends March 2027"), and photos of a driver's license and
-- insurance/AAA card (stored as private Storage paths, not raw files in the
-- table — same reasoning as broker Excel uploads, just a more sensitive
-- document so the bucket is private and scoped per-user like broker-uploads).

create table if not exists public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  zip_code text not null,
  address text,
  current_vehicle text,
  drivers_license_path text,
  insurance_card_path text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create policy "Customers can view their own profile"
  on public.customers for select
  using (auth.uid() = id);

create policy "Customers can update their own profile"
  on public.customers for update
  using (auth.uid() = id);

create policy "Customers can insert their own profile"
  on public.customers for insert
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- Storage bucket for driver's license / insurance card photo uploads
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('customer-uploads', 'customer-uploads', false)
on conflict (id) do nothing;

create policy "Customers can upload their own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'customer-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Customers can view their own documents"
  on storage.objects for select
  using (
    bucket_id = 'customer-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Customers can replace their own documents"
  on storage.objects for update
  using (
    bucket_id = 'customer-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
