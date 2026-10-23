-- Shopper accounts made for testing (by the Drive team), left out of the
-- admin Leads page numbers: sign-ups, saved cars and conversations
-- (lib/test-accounts.ts). Nothing is deleted; the flag only hides them
-- from the stats.
--
-- Safe to re-run.
alter table public.customers add column if not exists is_test boolean not null default false;

-- The team's test accounts as of 2026-10-22.
update public.customers set is_test = true
where id in (
  'e1948403-75dd-49e3-bcd9-fc64f7c3ff5e',
  'a4f22f3a-e7db-41ed-81fe-b98a7b33272a',
  'a3da0bb8-f732-4684-baf3-5d6857d15b07',
  '86e792c3-ab13-4728-a726-769aa9814ad2',
  '05ed6e74-631f-4dd8-84ec-ad19c0af690f',
  'cc72d16b-ed9a-40ce-a5bf-793a3225f22d',
  'd6549406-50fc-4971-a311-a03e4e0dfb1e'
);
