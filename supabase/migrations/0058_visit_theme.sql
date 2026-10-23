-- Which color mode each counted visit loaded in: light (the default) or
-- dark (chosen with the header toggle and remembered in the browser), sent
-- by components/VisitTracker.tsx. With the toggle picks in theme_choices
-- (0052), the admin Leads page shows how many visitors use light vs dark.
-- Visits recorded before this migration have no theme.
--
-- Safe to re-run.
alter table public.site_visits add column if not exists theme text;

do $$
begin
  alter table public.site_visits
    add constraint site_visits_theme_check check (theme is null or theme in ('light', 'dark'));
exception
  when duplicate_object then null;
end $$;
