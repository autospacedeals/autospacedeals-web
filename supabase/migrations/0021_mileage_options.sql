-- Mileage tiers: many brokers advertise one mileage allowance and list what
-- the others cost on top, e.g. "10k +$23 · 12k +$45 · 15k +$90". Stored per
-- listing as [{ "milesPerYear": 12000, "monthlyDelta": 45 }, ...] so
-- shoppers can pick a mileage in the deal page's payment estimator. The
-- advertised mileage (miles_per_year) isn't repeated here. Empty = only the
-- advertised mileage is offered.
--
-- Safe to re-run.
alter table public.deals add column if not exists mileage_options jsonb not null default '[]'::jsonb;

alter table public.deals drop constraint if exists deals_mileage_options_check;
alter table public.deals add constraint deals_mileage_options_check
  check (jsonb_typeof(mileage_options) = 'array' and jsonb_array_length(mileage_options) <= 10);
