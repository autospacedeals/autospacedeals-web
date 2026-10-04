-- Optional middle name for shopper accounts (sign-up, the Google
-- "finish your account" step, and the profile editor).
--
-- Safe to re-run.
alter table public.customers add column if not exists middle_name text;

alter table public.customers drop constraint if exists customers_middle_name_length_check;
alter table public.customers add constraint customers_middle_name_length_check
  check (middle_name is null or char_length(middle_name) <= 80);
