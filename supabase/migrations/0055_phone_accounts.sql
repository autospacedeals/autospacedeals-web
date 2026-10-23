-- Message a seller without signing up first: a shopper gives their name and
-- mobile number on a listing, confirms it with a texted code, and gets an
-- account behind the scenes (lib/phone-accounts.ts). Those accounts start
-- with just a first name and a phone, so a last name and zip code are now
-- optional (the zip is still asked for to show payments with tax).
--
-- Safe to re-run.
alter table public.customers alter column last_name drop not null;
alter table public.customers alter column zip_code drop not null;
