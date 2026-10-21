-- Light/dark choices from the header's theme toggle
-- (components/ThemeToggle.tsx -> /api/theme), so the admin Leads page can
-- show how many shoppers switch to light mode. Same visitor id as
-- site_visits; brokers, admins and bots aren't recorded.
--
-- Service role only (no policies). Safe to re-run.

create table if not exists public.theme_choices (
  id bigint generated always as identity primary key,
  visitor text not null,
  theme text not null check (theme in ('light', 'dark')),
  path text not null default '/',
  created_at timestamptz not null default now()
);

create index if not exists theme_choices_created_at_idx on public.theme_choices (created_at);

alter table public.theme_choices enable row level security;
revoke all on public.theme_choices from anon, authenticated;
