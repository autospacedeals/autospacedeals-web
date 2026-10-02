-- Whether a listed car can get to a shopper outside its own area: pick-up
-- only, delivers within its state, or ships nationwide. Null = not stated.
-- (Each listing already has its own city/state, which brokers can now set
-- per car instead of always inheriting their own.)
--
-- Safe to re-run.
alter table public.deals add column if not exists delivery text;

alter table public.deals drop constraint if exists deals_delivery_check;
alter table public.deals add constraint deals_delivery_check
  check (delivery is null or delivery in ('pickup', 'in_state', 'nationwide'));
