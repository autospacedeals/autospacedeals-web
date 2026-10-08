-- Admins get one email the first time a broker or dealer puts a car live
-- (lib/admin-alerts.ts: alertAdminsFirstListing). brokers.first_listing_at
-- records when that happened; the app claims it atomically ("set it if
-- it's still empty"), so the email goes out once even when several cars
-- publish at the same moment. Server-only: not readable or writable
-- through the API.
--
-- Safe to re-run.

alter table public.brokers add column if not exists first_listing_at timestamptz;

-- Brokers who have already posted don't get announced now.
update public.brokers b
   set first_listing_at = coalesce(
         (select min(v.recorded_at) from public.deal_versions v
           where v.broker_id = b.id and v.status in ('published', 'removed')),
         (select min(d.created_at) from public.deals d
           where d.broker_id = b.id and d.status in ('published', 'removed'))
       )
 where b.first_listing_at is null;

revoke update (first_listing_at) on public.brokers from anon, authenticated;
