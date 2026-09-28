-- Saved searches + email alerts: a signed-in customer can save the filters
-- they've set on the homepage ("Save this search") and get one digest email
-- per saved search when new matching deals are posted. They manage (and
-- delete) their saved searches on their account dashboard
-- (/customer/dashboard#alerts), and every alert email carries a one-off
-- unsubscribe link (/alerts/unsubscribe?token=…) that works without logging
-- in.
--
-- Three pieces:
--   1. saved_searches — one row per saved search. `filters` is the
--      homepage's full filter object (validated by the site before it's
--      stored), `label` a short summary like "SUV · Under $600/mo · CA".
--      Row Level Security keeps each customer to their own rows.
--   2. deals.published_at — when a listing first went live. Alerts only
--      include deals published after the saved search was created, so
--      saving a search never emails you the whole existing inventory.
--      Existing published listings are backfilled; from now on a trigger
--      sets it the first time a listing becomes 'published'.
--   3. saved_search_matches — which deals have already been emailed for
--      which saved search, so the hourly job
--      (app/api/cron/search-alerts/route.ts) never sends the same deal
--      twice. Only the site's server (service role) reads or writes it.
--
-- Deleting a customer account removes their saved searches, and deleting a
-- saved search or a deal removes its match rows (on delete cascade).
--
-- Safe to re-run: every statement is idempotent.

-- -----------------------------------------------------------------------------
-- 1. saved_searches
-- -----------------------------------------------------------------------------
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  filters jsonb not null,
  label text,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  -- The site stores a small flat object; these just keep a direct API
  -- write from stuffing anything else in.
  constraint saved_searches_filters_object check (jsonb_typeof(filters) = 'object'),
  constraint saved_searches_filters_size check (octet_length(filters::text) <= 4000),
  constraint saved_searches_label_length check (label is null or char_length(label) <= 200)
);

-- The dashboard lists one customer's saved searches newest first.
create index if not exists saved_searches_customer_created_idx
  on public.saved_searches (customer_id, created_at desc);

alter table public.saved_searches enable row level security;

drop policy if exists "Customers can view their own saved searches" on public.saved_searches;
create policy "Customers can view their own saved searches"
  on public.saved_searches for select
  using (auth.uid() = customer_id);

drop policy if exists "Customers can add their own saved searches" on public.saved_searches;
create policy "Customers can add their own saved searches"
  on public.saved_searches for insert
  with check (auth.uid() = customer_id);

drop policy if exists "Customers can update their own saved searches" on public.saved_searches;
create policy "Customers can update their own saved searches"
  on public.saved_searches for update
  using (auth.uid() = customer_id)
  with check (auth.uid() = customer_id);

drop policy if exists "Customers can delete their own saved searches" on public.saved_searches;
create policy "Customers can delete their own saved searches"
  on public.saved_searches for delete
  using (auth.uid() = customer_id);

-- The policies above let a customer write their own rows straight through
-- the public API, not just through the site — so the database, not the
-- request, decides when a search was created (alerts only cover deals
-- published after it), and an update can't move a search to another
-- customer or swap its unsubscribe token. Also caps each customer at 25
-- saved searches so the hourly job's work stays bounded. search_path is
-- pinned (Supabase lint 0011); everything here is schema-qualified or a
-- pg_catalog built-in.
create or replace function public.saved_searches_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.last_alerted_at := null;
    if (select count(*) from public.saved_searches where customer_id = new.customer_id) >= 25 then
      raise exception 'saved search limit reached' using errcode = '23514';
    end if;
  else
    new.customer_id := old.customer_id;
    new.created_at := old.created_at;
    new.unsubscribe_token := old.unsubscribe_token;
  end if;
  return new;
end;
$$;

drop trigger if exists saved_searches_guard on public.saved_searches;
create trigger saved_searches_guard
  before insert or update on public.saved_searches
  for each row execute function public.saved_searches_guard();

-- -----------------------------------------------------------------------------
-- 2. deals.published_at
-- -----------------------------------------------------------------------------
alter table public.deals add column if not exists published_at timestamptz;

-- Backfill listings that are already live. The exact value only matters
-- relative to saved searches, none of which can predate this migration.
update public.deals
set published_at = coalesce(created_at, date_posted::timestamptz, now())
where status = 'published' and published_at is null;

-- The hourly alert job reads "published in the last two weeks".
create index if not exists deals_published_at_idx on public.deals (published_at desc);

-- Set by the database only: brokers write their own listings through the
-- public API, and a hand-set date could make an old listing look new. It's
-- stamped the first time a listing becomes 'published' (on insert or
-- update) and then never changes — taking a listing down and restoring it
-- later doesn't count as newly posted, so it isn't alerted twice.
create or replace function public.deals_set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := case when new.status = 'published' then now() else null end;
  elsif old.published_at is not null then
    new.published_at := old.published_at;
  elsif new.status = 'published' then
    new.published_at := now();
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_set_published_at on public.deals;
create trigger deals_set_published_at
  before insert or update on public.deals
  for each row execute function public.deals_set_published_at();

-- -----------------------------------------------------------------------------
-- 3. saved_search_matches
-- -----------------------------------------------------------------------------
create table if not exists public.saved_search_matches (
  saved_search_id uuid not null references public.saved_searches (id) on delete cascade,
  deal_id uuid not null references public.deals (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (saved_search_id, deal_id)
);

-- The primary key covers "already sent for this search?" lookups; deal_id
-- gets its own index so deleting a deal (the cascade above) doesn't scan.
create index if not exists saved_search_matches_deal_id_idx
  on public.saved_search_matches (deal_id);

-- RLS on with no policies: the anon and customer roles can't read or write
-- it at all. Only the service role (the alert job) uses this table.
alter table public.saved_search_matches enable row level security;
