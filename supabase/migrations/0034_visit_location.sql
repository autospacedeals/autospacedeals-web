-- Approximate visitor location on site_visits (0033_lead_tracking.sql), for
-- the "By location" section of /admin/leads. City / state / country come
-- from Vercel's lookup of the visitor's IP address (x-vercel-ip-* request
-- headers); the IP address itself isn't stored.
--
-- Safe to re-run.
alter table public.site_visits add column if not exists country text;
alter table public.site_visits add column if not exists region text;
alter table public.site_visits add column if not exists city text;

do $$
begin
  alter table public.site_visits
    add constraint site_visits_location_length check (
      (country is null or char_length(country) <= 8)
      and (region is null or char_length(region) <= 16)
      and (city is null or char_length(city) <= 80)
    );
exception
  when duplicate_object then null;
end;
$$;
