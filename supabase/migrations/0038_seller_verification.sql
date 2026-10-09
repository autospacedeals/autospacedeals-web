-- Seller verification: every new broker or dealership salesperson gives a
-- DMV license number at sign-up and starts unverified. They can set up
-- their account and add cars, but nothing they post is public until an
-- admin checks the license and approves them (Admin → Users).
--
--   brokers.license_number — the dealer/autobroker license (brokers) or
--                            salesperson license (salespeople). Private.
--   brokers.approved_at    — when an admin approved them; null = pending.
--
-- The public can only see published deals from approved sellers; the
-- seller still sees their own (their own-rows policy is unchanged).
--
-- Safe to re-run.

alter table public.brokers add column if not exists license_number text;
alter table public.brokers add column if not exists approved_at timestamptz;

-- Everyone already on the site stays approved.
update public.brokers set approved_at = created_at where approved_at is null;

-- Sellers can't change these themselves; the app writes them server-side
-- with the service role. (A column revoke alone doesn't hold when the role
-- has table-wide update, so a trigger enforces it.)
revoke update (license_number, approved_at) on public.brokers from anon, authenticated;

create or replace function public.brokers_protect_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.approved_at := null;
      new.first_listing_at := null;
    else
      new.approved_at := old.approved_at;
      new.license_number := old.license_number;
      new.first_listing_at := old.first_listing_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists brokers_protect_verification on public.brokers;
create trigger brokers_protect_verification
  before insert or update on public.brokers
  for each row execute function public.brokers_protect_verification();
-- Public pages may check whether a seller is approved (not the license).
grant select (approved_at) on public.brokers to anon, authenticated;

create or replace function public.broker_is_approved(p_broker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.brokers b where b.id = p_broker_id and b.approved_at is not null
  );
$$;

revoke all on function public.broker_is_approved(uuid) from public;
grant execute on function public.broker_is_approved(uuid) to anon, authenticated;

drop policy if exists "Anyone can view published deals" on public.deals;
create policy "Anyone can view published deals"
  on public.deals for select
  using (status = 'published' and (broker_id is null or public.broker_is_approved(broker_id)));
