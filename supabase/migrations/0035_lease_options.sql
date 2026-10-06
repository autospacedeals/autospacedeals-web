-- Other lease terms for the same car: many brokers price one car at several
-- terms ("24/7500 $330 · 36/7500 $345 · 36/10k $356"). The listing's own
-- term / miles_per_year / payment stay the headline price (and
-- mileage_options the other mileages at that term); lease_options holds the
-- rest as exact prices: [{ "term": 36, "milesPerYear": 10000, "payment": 356 }].
-- Shoppers pick a term and mileage on the deal page; filters and sorting
-- match any of them.
--
-- Safe to re-run.
alter table public.deals add column if not exists lease_options jsonb not null default '[]'::jsonb;
