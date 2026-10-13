-- Where a contact-form message came from: the sender's approximate city,
-- state/region and country (looked up from their IP by Vercel, the same as
-- site visits in 0033) and how they found Drive (their drive_src cookie:
-- google, instagram, an ad...). Shown on /admin/contact and in the email.
--
-- Safe to re-run.
alter table public.contact_messages add column if not exists country text;
alter table public.contact_messages add column if not exists region text;
alter table public.contact_messages add column if not exists city text;
alter table public.contact_messages add column if not exists source text;
alter table public.contact_messages add column if not exists campaign text;
