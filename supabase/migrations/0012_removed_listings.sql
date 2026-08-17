-- Soft-delete support: removing a listing used to permanently delete the
-- row. Now it's marked 'removed' and kept, with a timestamp, so brokers can
-- see a history of what they've taken down (and when) instead of it just
-- vanishing — and so it can be restored if removed by mistake.
alter table public.deals drop constraint if exists deals_status_check;
alter table public.deals add constraint deals_status_check check (status in ('draft', 'published', 'removed'));

alter table public.deals add column if not exists removed_at timestamptz;
