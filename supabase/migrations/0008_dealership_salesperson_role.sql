-- Replaces the "Dealer" seller type with "Salesperson": an individual who
-- works at a dealership (not an independent broker) and posts listings
-- under their own name, with the dealership they work at shown alongside
-- it — similar to how a broker's business name is shown today, just with
-- an added affiliation. This is a plain field on the existing brokers
-- account (not a separate shared "dealership" entity/table) per Robert:
-- "it would be the person's account but show they work at this
-- dealership."
--
-- For a Salesperson account, business_name holds the PERSON's own name
-- (so every existing "seller name" display continues to work unchanged),
-- and dealership_name is the new secondary "works at X" detail.

alter table public.brokers
  add column if not exists dealership_name text;

-- Any existing 'Dealer' accounts become 'Salesperson' — there's no
-- meaningful backfill for dealership_name (nothing was captured before),
-- so those rows just won't show a dealership affiliation until edited.
update public.brokers set seller_type = 'Salesperson' where seller_type = 'Dealer';

alter table public.brokers
  drop constraint if exists brokers_seller_type_check;
alter table public.brokers
  add constraint brokers_seller_type_check
  check (seller_type in ('Broker', 'Salesperson'));

-- Same denormalization pattern as seller_name/seller_phone/etc. on deals —
-- carried over at insert time so a listing keeps showing the correct
-- affiliation even if the salesperson's profile changes later.
alter table public.deals
  add column if not exists seller_dealership text;

update public.deals set seller_type = 'Salesperson' where seller_type = 'Dealer';

alter table public.deals
  drop constraint if exists deals_seller_type_check;
alter table public.deals
  add constraint deals_seller_type_check
  check (seller_type in ('Broker', 'Salesperson'));
