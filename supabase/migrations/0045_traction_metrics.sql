-- Month-by-month traction numbers for the admin Traction page
-- (/admin/traction, lib/traction.ts): visitors (new / returning, and how
-- they found Drive), listing views, shopper sign-ups, conversations,
-- messages, saves, closed deals, sellers and listings. Counted in the
-- database so it stays fast as visits grow. Months are Pacific time.
--
-- The internal "test" seller and throwaway "(delete me)" accounts are left
-- out.
--
-- Service role only.
--
-- Safe to re-run.

create or replace function public.admin_traction_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
tz as (select 'America/Los_Angeles'::text as name),
excluded as (
  select id from public.brokers
   where lower(business_name) = 'test' or business_name ilike '%(delete me)%'
),
bounds as (
  select date_trunc('month', least(
           coalesce((select min(created_at) from public.site_visits), now()),
           coalesce((select min(created_at) from public.brokers), now())
         ) at time zone (select name from tz)) as first_month,
         date_trunc('month', now() at time zone (select name from tz)) as this_month
),
months as (
  select generate_series((select first_month from bounds), (select this_month from bounds), interval '1 month') as m
),
v as (
  select visitor, kind, coalesce(nullif(source, ''), 'direct') as source, created_at,
         date_trunc('month', created_at at time zone (select name from tz)) as m,
         (created_at at time zone (select name from tz))::date as d
    from public.site_visits
),
first_seen as (
  select visitor, min(created_at) as first_at from public.site_visits group by visitor
),
visitor_month as (
  select v.m, v.visitor, count(distinct v.d) as days, min(f.first_at) as first_at
    from v join first_seen f using (visitor)
   group by v.m, v.visitor
),
-- How each visitor found Drive that month: the source of their first visit in it.
visitor_source as (
  select distinct on (m, visitor) m, visitor, source
    from v
   order by m, visitor, created_at
),
visits_by_month as (
  select vm.m,
         count(*) as visitors,
         count(*) filter (where date_trunc('month', vm.first_at at time zone (select name from tz)) = vm.m) as new_visitors,
         count(*) filter (where date_trunc('month', vm.first_at at time zone (select name from tz)) < vm.m or vm.days > 1) as returning_visitors
    from visitor_month vm
   group by vm.m
),
views_by_month as (
  select m, count(*) filter (where kind = 'listing') as listing_views from v group by m
),
sources as (
  select m, source, count(*) as visitors from visitor_source group by m, source
),
by_month as (
  select date_trunc('month', created_at at time zone (select name from tz)) as m, 'signups' as k, count(*) as n
    from public.customers group by 1
  union all
  select date_trunc('month', c.created_at at time zone (select name from tz)), 'conversations', count(*)
    from public.conversations c where c.broker_id not in (select id from excluded) group by 1
  union all
  select date_trunc('month', msg.created_at at time zone (select name from tz)), 'messages', count(*)
    from public.messages msg join public.conversations c on c.id = msg.conversation_id
   where c.broker_id not in (select id from excluded) group by 1
  union all
  select date_trunc('month', c.outcome_at at time zone (select name from tz)), 'sold', count(*)
    from public.conversations c
   where c.outcome = 'sold' and c.outcome_at is not null and c.broker_id not in (select id from excluded) group by 1
  union all
  select date_trunc('month', created_at at time zone (select name from tz)), 'saved_deals', count(*)
    from public.saved_deals group by 1
  union all
  select date_trunc('month', created_at at time zone (select name from tz)), 'saved_searches', count(*)
    from public.saved_searches group by 1
  union all
  select date_trunc('month', coalesce(approved_at, created_at) at time zone (select name from tz)), 'sellers_new', count(*)
    from public.brokers where id not in (select id from excluded) and approved_at is not null group by 1
  union all
  select date_trunc('month', created_at at time zone (select name from tz)), 'listings_added', count(*)
    from public.deals where broker_id is not null and broker_id not in (select id from excluded) group by 1
)
select jsonb_build_object(
  'months', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'month', to_char(mo.m, 'YYYY-MM'),
      'visitors', coalesce(vb.visitors, 0),
      'newVisitors', coalesce(vb.new_visitors, 0),
      'returningVisitors', coalesce(vb.returning_visitors, 0),
      'listingViews', coalesce(vw.listing_views, 0),
      'signups', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'signups'), 0),
      'conversations', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'conversations'), 0),
      'messages', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'messages'), 0),
      'sold', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'sold'), 0),
      'savedDeals', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'saved_deals'), 0),
      'savedSearches', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'saved_searches'), 0),
      'sellersNew', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'sellers_new'), 0),
      'sellersTotal', (
        select count(*) from public.brokers br
         where br.id not in (select id from excluded) and br.approved_at is not null
           and date_trunc('month', coalesce(br.approved_at, br.created_at) at time zone (select name from tz)) <= mo.m
      ),
      'listingsAdded', coalesce((select sum(n) from by_month b where b.m = mo.m and b.k = 'listings_added'), 0)
    ) order by mo.m), '[]'::jsonb)
      from months mo
      left join visits_by_month vb on vb.m = mo.m
      left join views_by_month vw on vw.m = mo.m
  ),
  'sources', (
    select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'source', source, 'visitors', visitors)), '[]'::jsonb)
      from sources
  ),
  'now', jsonb_build_object(
    'liveListings', (
      select count(*) from public.deals d
       where d.status = 'published' and d.broker_id is not null and d.broker_id not in (select id from excluded)
         and exists (select 1 from public.brokers b where b.id = d.broker_id and b.approved_at is not null)
    ),
    'liveSellers', (
      select count(distinct d.broker_id) from public.deals d
       where d.status = 'published' and d.broker_id not in (select id from excluded)
         and exists (select 1 from public.brokers b where b.id = d.broker_id and b.approved_at is not null)
    ),
    'makes', (
      select count(distinct d.make) from public.deals d
       where d.status = 'published' and d.broker_id not in (select id from excluded)
    ),
    'shoppers', (select count(*) from public.customers),
    'visitorsAllTime', (select count(distinct visitor) from public.site_visits)
  )
);
$$;

revoke all on function public.admin_traction_metrics() from public, anon, authenticated;
