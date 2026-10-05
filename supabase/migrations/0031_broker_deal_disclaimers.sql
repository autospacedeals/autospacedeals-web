-- A broker's standard disclosure text by make, e.g.
--   { "Mercedes-Benz": "* Lease payments shown before…", "BMW": "…" }
-- added to the end of the description of every new car of that make they
-- post (sheet syncs, uploads, manual adds). See lib/deal-disclaimers.ts.
--
-- Server-only: not added to the public column grant in 0024_messaging.sql.
--
-- Safe to re-run.
alter table public.brokers add column if not exists deal_disclaimers jsonb not null default '{}'::jsonb;
