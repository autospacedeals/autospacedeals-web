-- Customers now give a phone number when they sign up (brokers already do,
-- as brokers.contact_phone), stored as "(949) 555-1234". Nullable because
-- customers who signed up before this have none; they can add it from
-- their dashboard. Only the customer themselves can read it (the existing
-- customers RLS policies).
--
-- Safe to re-run.
alter table public.customers add column if not exists phone text;

alter table public.customers drop constraint if exists customers_phone_length_check;
alter table public.customers add constraint customers_phone_length_check
  check (phone is null or char_length(phone) <= 20);
