-- =============================================================================
-- Migration: relax which vehicle details are required when a broker adds a
-- car. Required going forward: year, make, model, msrp, payment (unless
-- one-pay), due at signing, term, and miles/year (leases only). Trim, body
-- style, fuel, exterior/interior color, selling price, and photos are all
-- optional now — a missing photo falls back to a generic placeholder (or an
-- auto-pulled CarsXE photo, once wired up) instead of blocking publish.
-- =============================================================================

alter table public.deals
  alter column trim drop not null,
  alter column body_style drop not null,
  alter column fuel drop not null,
  alter column exterior drop not null,
  alter column interior drop not null,
  alter column msrp set not null;
