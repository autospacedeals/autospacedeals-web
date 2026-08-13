-- Two independent broker-facing display options:
--   1. payment_tax_rate: like due_at_signing_tax_rate, but for the advertised
--      monthly payment — lets a broker disclose "this payment already
--      includes an assumed X.XX% tax rate" instead of leaving shoppers to
--      guess whether tax is baked in.
--   2. mask_msrp: when true, the public-facing MSRP display masks the last
--      few digits (e.g. "$49,XXX") instead of showing the exact number —
--      some brokers prefer not to publish the exact MSRP.
alter table public.deals
  add column if not exists payment_tax_rate numeric(5, 2);

alter table public.deals
  add column if not exists mask_msrp boolean not null default false;
