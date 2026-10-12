-- MSDs as an option: many listings show two payments, without MSDs and a
-- lower one with them ("$520/mo no MSD, $470/mo with 10 MSDs"). msd_payment
-- is the monthly payment WITH the MSDs (msd_count / msd_total, 0020); the
-- listing's payment is then the one without. When msd_payment is null and
-- msd_count is set, the payment itself assumes the MSDs (as before).
--
-- Safe to re-run.
alter table public.deals add column if not exists msd_payment numeric;

alter table public.deals drop constraint if exists deals_msd_payment_check;
alter table public.deals add constraint deals_msd_payment_check check (
  msd_payment is null or (msd_count is not null and msd_payment > 0 and msd_payment <= 100000)
);
