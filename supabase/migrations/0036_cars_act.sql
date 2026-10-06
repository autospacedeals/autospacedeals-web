-- California CARS Act (SB 766, in effect since Oct 1, 2026). Listings on
-- Drive count as the dealer's own ads, so:
--
--   deal_versions — an archive of every listing as it was shown: a full
--                   copy of the row each time it's created, changed,
--                   taken down or deleted (dealers must keep 2 years of
--                   online ads). Written by a trigger, so every path is
--                   covered: broker edits, sheet syncs, admin edits.
--                   Never pruned automatically; keep at least 2 years.
--                   Brokers can read their own rows (the dashboard's
--                   "Ad archive"), and nobody can change them.
--   total price   — a published listing from a dealership salesperson must
--                   show the vehicle's total price (selling_price: the
--                   price before taxes and government fees). The site
--                   checks this with a friendly message first; the
--                   constraint is the backstop. Brokers are encouraged,
--                   not required, until legal review says otherwise.
--
-- Safe to re-run.

-- -----------------------------------------------------------------------------
-- 1. Ad archive
-- -----------------------------------------------------------------------------
create table if not exists public.deal_versions (
  id bigint generated always as identity primary key,
  -- No foreign keys: the archive outlives the listing and the account.
  deal_id uuid not null,
  broker_id uuid,
  change text not null,
  status text,
  snapshot jsonb not null,
  recorded_at timestamptz not null default now()
);

do $$
begin
  alter table public.deal_versions drop constraint if exists deal_versions_change_check;
  alter table public.deal_versions add constraint deal_versions_change_check
    check (change in ('baseline', 'created', 'updated', 'published', 'removed', 'deleted'));
end;
$$;

create index if not exists deal_versions_broker_idx on public.deal_versions (broker_id, recorded_at desc);
create index if not exists deal_versions_deal_idx on public.deal_versions (deal_id, recorded_at desc);

alter table public.deal_versions enable row level security;

drop policy if exists "Brokers can view their own ad archive" on public.deal_versions;
create policy "Brokers can view their own ad archive"
  on public.deal_versions for select
  using (auth.uid() = broker_id);
-- No insert/update/delete policies: only the trigger below writes, and
-- the record can't be changed through the API.

-- Columns that don't change what the ad says (housekeeping) — an update
-- touching only these isn't archived.
create or replace function public.deals_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ignored text[] := array['updated_at', 'popularity', 'match_signature', 'sheet_tab', 'submission_id', 'removed_at'];
  kind text;
begin
  if tg_op = 'DELETE' then
    insert into public.deal_versions (deal_id, broker_id, change, status, snapshot)
      values (old.id, old.broker_id, 'deleted', old.status, to_jsonb(old));
    return old;
  end if;

  if tg_op = 'INSERT' then
    kind := 'created';
  else
    if (to_jsonb(new) - ignored) = (to_jsonb(old) - ignored) then
      return new;
    end if;
    kind := case
      when new.status = 'removed' and old.status is distinct from 'removed' then 'removed'
      when new.status = 'published' and old.status is distinct from 'published' then 'published'
      else 'updated'
    end;
  end if;

  insert into public.deal_versions (deal_id, broker_id, change, status, snapshot)
    values (new.id, new.broker_id, kind, new.status, to_jsonb(new));
  return new;
end;
$$;

revoke all on function public.deals_archive() from public, anon, authenticated;

drop trigger if exists deals_archive on public.deals;
create trigger deals_archive
  after insert or update or delete on public.deals
  for each row execute function public.deals_archive();

-- Starting point: today's copy of every existing listing (once).
insert into public.deal_versions (deal_id, broker_id, change, status, snapshot)
select d.id, d.broker_id, 'baseline', d.status, to_jsonb(d)
  from public.deals d
 where not exists (select 1 from public.deal_versions v where v.deal_id = d.id);

-- -----------------------------------------------------------------------------
-- 2. Total price on dealership listings
-- -----------------------------------------------------------------------------
do $$
begin
  alter table public.deals
    add constraint deals_salesperson_total_price
    check (seller_type <> 'Salesperson' or status <> 'published' or selling_price is not null) not valid;
exception
  when duplicate_object then null;
end;
$$;

-- Applies to existing rows too when none break it (there should be none).
do $$
begin
  alter table public.deals validate constraint deals_salesperson_total_price;
exception
  when check_violation then raise notice 'Some published salesperson listings have no total price yet; new ones are checked.';
end;
$$;
