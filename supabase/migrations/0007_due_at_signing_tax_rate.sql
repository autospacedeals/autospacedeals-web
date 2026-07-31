-- Lets a broker optionally note that their advertised "due at signing"
-- figure assumes a specific tax rate (e.g. entering 7.75 shows shoppers
-- "assumes 7.75% tax" next to the number) — purely informational, not used
-- in any calculation. Null/unset means no assumption was stated.
alter table public.deals
  add column if not exists due_at_signing_tax_rate numeric(5, 2);
