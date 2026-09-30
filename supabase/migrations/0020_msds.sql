-- Multiple security deposits (MSDs): refundable deposits a lessee pays up
-- front to lower the lease's money factor. Many advertised payments assume
-- some number of them, so a listing records how many the payment assumes
-- and their refundable total (paid at signing on top of the due-at-signing
-- amount, returned at lease end). Both null = no MSDs.
alter table public.deals add column if not exists msd_count integer;
alter table public.deals add column if not exists msd_total numeric;

alter table public.deals drop constraint if exists deals_msd_count_check;
alter table public.deals add constraint deals_msd_count_check check (msd_count is null or msd_count between 1 and 20);
alter table public.deals drop constraint if exists deals_msd_total_check;
alter table public.deals add constraint deals_msd_total_check check (msd_total is null or (msd_total >= 0 and msd_total <= 250000));
