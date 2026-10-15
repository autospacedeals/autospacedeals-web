-- How often people come back, for the admin Traction page (lib/traction.ts):
-- per visitor (browser), the different days they visited (Pacific time,
-- one "landing" per browsing session — see components/VisitTracker.tsx),
-- then how many came back on another day, how many days they visited, and
-- how soon they returned. All time.
--
-- Service role only.
--
-- Safe to re-run.

create or replace function public.admin_return_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with s as (
  select visitor, (created_at at time zone 'America/Los_Angeles')::date as d
    from public.site_visits
   where kind = 'landing'
),
v as (
  select visitor,
         count(distinct d) as days,
         min(d) as first_day,
         (array_agg(distinct d order by d))[2] as second_day
    from s
   group by visitor
)
select jsonb_build_object(
  'visitors', count(*),
  'cameBack', count(*) filter (where days > 1),
  'days1', count(*) filter (where days = 1),
  'days2', count(*) filter (where days = 2),
  'days3to5', count(*) filter (where days between 3 and 5),
  'days6plus', count(*) filter (where days >= 6),
  'within7', count(*) filter (where second_day is not null and second_day - first_day <= 7),
  'within30', count(*) filter (where second_day is not null and second_day - first_day <= 30),
  'medianDaysToReturn', percentile_cont(0.5) within group (order by (second_day - first_day)) filter (where second_day is not null),
  'avgDays', round(avg(days)::numeric, 2)
)
from v;
$$;

revoke all on function public.admin_return_metrics() from public, anon, authenticated;
