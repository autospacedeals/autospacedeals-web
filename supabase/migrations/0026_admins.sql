-- Drive admins (the /admin pages: users, all messages, submissions, admins).
-- Admins add and remove each other from /admin/admins; this table is the
-- list. The site's owner account in lib/admin.ts (OWNER_EMAILS) is always
-- an admin as a fallback, so access can't be locked out by mistake.
--
-- Only the server reads or writes it (service role): RLS on, no policies.
--
-- Safe to re-run.
create table if not exists public.admins (
  email text primary key,
  added_by text,
  created_at timestamptz not null default now(),
  constraint admins_email_lowercase check (email = lower(email)),
  constraint admins_email_length check (char_length(email) <= 254)
);

alter table public.admins enable row level security;
