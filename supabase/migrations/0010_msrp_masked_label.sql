-- Stores the literal masked MSRP text a broker typed (e.g. "$54,XXX")
-- when they hide part of the MSRP by typing x's into the field, instead
-- of computing/storing the true number and masking it only for display.
-- Null for unmasked listings, and for masked listings created before
-- this column existed (those keep falling back to auto-masking the
-- last 3 digits of the real `msrp` value).
alter table public.deals add column if not exists msrp_masked_label text;
