-- =============================================================================
-- Migration: move live deal inventory from the static lib/deals-data.ts file
-- into the database, so brokers can self-manage their own listings (add,
-- edit price/details, remove) directly from their dashboard, and so admin
-- can "stage" draft cars for a broker to review/confirm after reading a
-- submitted forum link, Google Sheet, or Excel file.
--
-- Run this once in the Supabase SQL Editor, AFTER 0001 (schema.sql) and
-- 0002 have already been run.
-- =============================================================================

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,

  -- Owner. Null = admin-managed legacy listing (not tied to a broker portal
  -- account). Non-null = self-service, owned by that broker.
  broker_id uuid references public.brokers (id) on delete set null,

  -- Vehicle
  year int not null,
  make text not null,
  model text not null,
  trim text not null,
  body_style text not null,
  fuel text not null,
  exterior text not null,
  interior text not null,

  -- Deal
  deal_type text not null check (deal_type in ('Lease', 'Finance')),
  msrp numeric,
  selling_price numeric,
  payment numeric not null,
  due_at_signing numeric not null,
  term int not null,
  miles_per_year int,
  apr numeric,

  -- Seller (denormalized at insert time from the broker's profile, or set
  -- manually for admin-managed listings — kept editable per-listing in case
  -- a broker operates under more than one business name/location)
  seller_type text not null check (seller_type in ('Dealer', 'Broker')),
  seller_name text not null,
  seller_phone text not null,
  seller_email text not null,
  city text not null,
  state text not null,

  -- Trust / status
  verified boolean not null default false,
  in_stock boolean not null default true,
  popularity int not null default 50,
  date_posted date not null default current_date,

  -- Content
  badge text,
  notes text not null default '',
  packages text[] not null default '{}',
  images text[] not null default '{}',
  source_url text,
  sample boolean not null default false,
  one_pay boolean not null default false,

  -- Publishing lifecycle:
  --   draft     — staged by admin from a broker's submitted link/sheet/file,
  --               waiting for that broker to review and confirm/decline it.
  --   published — live on the public site.
  status text not null default 'published' check (status in ('draft', 'published')),

  -- Traceability back to the submission this was staged from, if any.
  submission_id uuid references public.submissions (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deals_status_idx on public.deals (status);
create index if not exists deals_broker_id_idx on public.deals (broker_id);

alter table public.deals enable row level security;

-- The public site can only ever see published listings.
create policy "Anyone can view published deals"
  on public.deals for select
  using (status = 'published');

-- Brokers can always see their own deals, including drafts pending their
-- confirmation.
create policy "Brokers can view their own deals"
  on public.deals for select
  using (auth.uid() = broker_id);

-- Brokers can publish new listings directly (used by the "add a car
-- manually" form) and can insert to move a draft to published — see update
-- policy below for that path instead.
create policy "Brokers can insert their own deals"
  on public.deals for insert
  with check (auth.uid() = broker_id);

-- Brokers can edit/reprice/mark out-of-stock or confirm-publish a draft —
-- all changes to their own rows go live immediately, no re-approval.
create policy "Brokers can update their own deals"
  on public.deals for update
  using (auth.uid() = broker_id);

-- Brokers can remove their own listings (including declining a staged
-- draft they don't want) at any time.
create policy "Brokers can delete their own deals"
  on public.deals for delete
  using (auth.uid() = broker_id);

-- Draft rows are staged by admin (via the service role client, which
-- bypasses RLS entirely) on behalf of a broker after reviewing their
-- submitted link/sheet/file — brokers never get a direct insert-as-draft
-- path, keeping that human review step intact.

create or replace function public.set_deals_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_deals_updated_at();

-- -----------------------------------------------------------------------------
-- Seed: the 19 real deals currently hardcoded in lib/deals-data.ts, carried
-- over as admin-managed (broker_id null) so nothing on the live site breaks.
-- Safe to re-run — skips rows that already exist by slug.
-- -----------------------------------------------------------------------------
insert into public.deals (
  slug, broker_id,
  year, make, model, trim, body_style, fuel, exterior, interior,
  deal_type, msrp, selling_price, payment, due_at_signing, term, miles_per_year, apr,
  seller_type, seller_name, seller_phone, seller_email, city, state,
  verified, in_stock, popularity, date_posted,
  badge, notes, packages, images,
  source_url, sample, one_pay,
  status
) values
  (
    '2026-mercedes-benz-glc-300-4matic-ca', NULL,
    2026, 'Mercedes-Benz', 'GLC 300', '4MATIC', 'SUV', 'Gas', 'Polar White', 'Black',
    'Lease', 57000, 53000, 299, 3500, 24, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 80, '2026-07-04'::date,
    'HOT', 'Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household (proof of registration required). $599 broker fee is included in the due-at-signing total above. Serves both Norcal and Socal.', ARRAY['AMG Line Lite Plus']::text[], ARRAY['/cars/2026-mercedes-glc300-polar-white.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811', false, false,
    'published'
  ),
  (
    '2026-mercedes-benz-c300-ca', NULL,
    2026, 'Mercedes-Benz', 'C300', 'Base', 'Sedan', 'Gas', 'Black', 'Beige',
    'Lease', 55500, 52000, 379, 3500, 24, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 62, '2026-07-04'::date,
    'VALUE', 'Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household (proof of registration required). $599 broker fee is included in the due-at-signing total above.', ARRAY['Heated & Ventilated Seats', '19" AMG Multispokes']::text[], ARRAY['https://vehicle-images.carscommerce.inc/stock-images/chrome/3a20930987c9467048d312873b7913e5.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811', false, false,
    'published'
  ),
  (
    '2026-mercedes-benz-gle-450-coupe-ca', NULL,
    2026, 'Mercedes-Benz', 'GLE 450 Coupe', 'Base', 'SUV', 'Gas', 'Graphite Gray', 'Black',
    'Lease', 86500, 81000, 729, 3500, 24, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 57, '2026-07-04'::date,
    'NEW', 'Coupe-styled SUV. Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household (proof of registration required). $699 broker fee is included in the due-at-signing total above.', ARRAY['Night Package', 'Exclusive Trim']::text[], ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/A6ZVqgdvNgNS-tOdpleojQHoHqEV8nKHGlrR76ELO5XWtalKRnDL8BGHYut49a8CXEjwjGd_0bCnS3pA250bC5Ka5L8cIEayqQKh2BXLkRaF8_AqZlrL2kN2Xbx4u8s7I_b0sQ0ufjiaaQWPB2Vc7Hx-xz3FRAa249F-SycEZNiyodpt0DDRTn4MrQsCBsjsQOnu7vItCuU/cc_2026MBSA11972885_02_640_956.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811', false, false,
    'published'
  ),
  (
    '2025-porsche-macan-loaner-ca', NULL,
    2025, 'Porsche', 'Macan', 'Base (Loaner)', 'SUV', 'Gas', 'White', 'Black',
    'Lease', 66000, 62000, 699, 4995, 24, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 48, '2026-07-04'::date,
    'VALUE', 'Former loaner unit with low miles, full factory warranty remaining. Payment is +tax. $499 broker fee is included in the due-at-signing total above.', '{}', ARRAY['https://file.kelleybluebookimages.com/kbb/base/evox/CP/55153/2025-Porsche-Macan-front_55153_032_2400x1800_A1.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811', false, false,
    'published'
  ),
  (
    '2026-bmw-x5-xdrive40i-msport-skyscraper-gray-ca', NULL,
    2026, 'BMW', 'X5', 'xDrive40i M Sport', 'SUV', 'Gas', 'Skyscraper Gray', 'Black',
    'Lease', 84000, 78000, 819, 3500, 39, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 68, '2026-05-06'::date,
    'HOT', 'Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $599 broker fee is included in the due-at-signing total above.', ARRAY['M Sport', 'Parking Assistance', '21" Wheels', 'Trailer Hitch', '4-Zone Climate']::text[], ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkopc2mFsQ0AUs_xru79YZFSeXSVQkY2w4NlDrU74XvajDCTMdJdgADwu8ZxJ1V9jM9BMEarQAyVaolWMasMH1Tzf663PxdnfXkHzPXTfExsO0L3cz2eHhZCh3OfTtNXhqEzmBB7WGGJnohwhCnijuOjpR0qHuJvKIL7dogXDH0VYw5ojcjGgr7Uwsybs5-BLNw/cc_2026BMS191998062_01_640_C36.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812', false, false,
    'published'
  ),
  (
    '2026-bmw-i4-edrive40-black-real-ca', NULL,
    2026, 'BMW', 'i4 eDrive40', 'Premium', 'Sedan', 'EV', 'Black', 'Black',
    'Lease', 66000, 62000, 435, 3500, 36, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 61, '2026-05-06'::date,
    'EV', 'Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $599 broker fee is included in the due-at-signing total above.', ARRAY['Premium Package', 'Driving Assistance']::text[], ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkpewSF6eUJXr3lvFYdV-b4Is-XetRvtnAvIQGH-ZKq4PLJ2wjzesxpGlwXWIK56HSkiULTwl4u5LW-yXuLVeG2qURtorTZdK0uVoFWeriC8LQogCQacqNpEcwQnEe9KurMgyWT-1reon5Kc0ECzBS8ibtonSH-AnKQwiZWvo0Jndg/cc_2026BMCA12021366_01_640_475.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812', false, false,
    'published'
  ),
  (
    '2026-bmw-740i-brooklyn-gray-ca', NULL,
    2026, 'BMW', '740i', 'xDrive M-Sport Professional', 'Sedan', 'Gas', 'Brooklyn Gray', 'Mocha',
    'Lease', 112000, 105000, 899, 3500, 39, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 54, '2026-05-06'::date,
    'NEW', 'Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $699 broker fee is included in the due-at-signing total above.', ARRAY['Driving Assistance Pro', 'Premium', 'M-Sport Professional', 'Alcantara Headliner']::text[], ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkqC4sTjZ1QIbMkqejuDBEg8x37QMnp4nmnDlruDNFrRqpuUSEIFtOcUQqnRZud1t6wHsoBQhZOt5KFWVGm2uawx8k_lOmwTSmBcaLXil7qk7BnvGhTBe_HDnQb2Juewvm3q0_Nqn7bdeGO9tgru7mF4-xXfAvTzoj9zD08ulFXjQg/cc_2026BMC082046588_01_640_C4P.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812', false, false,
    'published'
  ),
  (
    '2026-bmw-x3-30-white-ca', NULL,
    2026, 'BMW', 'X3', '30 xDrive', 'SUV', 'Gas', 'White', 'Beige',
    'Lease', 59000, 55000, 509, 3500, 39, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 57, '2026-05-06'::date,
    'VALUE', 'Payment is +tax. BMW deals require loyalty — a BMW currently registered in the household. $599 broker fee is included in the due-at-signing total above.', ARRAY['Convenience Package', 'Glow Grill']::text[], ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/o10qiMPxXkoxFD7oJYIQxSKyjANEuKNyF29qOCq7Xsilj5Zke2lneSpOOg8cn9piDEPhQ1gjdgea7BVjXgjVgMtgmD30xD-L06mzfCqo5ya-cQi6wcvpFgY4Z7M7LGJF774Y40pmNGdgOdg1TOWZsqS6lWYsj-VXEsKcoaCOSCse0OTpKlmnbRgZFIOKKlQybvtt_jzYFMQQlKenPLNITQ/cc_2026BMS202001149_01_640_300.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812', false, false,
    'published'
  ),
  (
    '2025-audi-a5-premium-plus-loaner-ca', NULL,
    2025, 'Audi', 'A5', 'Premium Plus', 'Sedan', 'Gas', 'Mythos Black', 'Black',
    'Lease', 54000, 49000, 319, 3000, 36, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 50, '2026-05-06'::date,
    'VALUE', 'Loaner unit with low miles. Payment is +tax. Audi loyalty incentive may apply — ask broker for current eligibility. $699 broker fee is included in the due-at-signing total above.', ARRAY['Warm Weather Package', '19" Wheel Package']::text[], ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/yWhhamuIqoYVO2hbFBmRgVaCtskpU2OI-PGYbRSaYLFJWt2bWvCG-_v-oOdJGkurVSV4d9cHrmckwxAdmynBUMZzvFJomlG2EoWBIRl9Orkk3B4-265hLstgkUSqevWpo1R3LiKdZmbLmPPYQID5KYmGBH1LX_Mv0eHC2s0eMzawYOp7nwG8ohTVFzFLXncM/cc_2025AUC432047398_01_640_0E0E.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812', false, false,
    'published'
  ),
  (
    '2025-audi-s5-premium-plus-ca', NULL,
    2025, 'Audi', 'S5', 'Premium Plus', 'Sedan', 'Gas', 'Black', 'Black',
    'Lease', 67000, 63000, 699, 3500, 36, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 46, '2026-05-06'::date,
    'NEW', 'Payment is +tax. Audi loyalty incentive may apply — ask broker for current eligibility. $599 broker fee is included in the due-at-signing total above.', ARRAY['Sports Seats Plus', 'Sport Adaptive Damping Suspension']::text[], ARRAY['https://autoimage.capitalone.com/stock-media/chrome/2025-Audi-S5-Premium_Plus-0E0E-cc_2025AUC441987508_01_2100_0E0E.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-bmw-audi-i4-415-3-5k-x5e-829-3-5k-740-885-3-5k-q7-699-3-5k/759812', false, false,
    'published'
  ),
  (
    '2026-mercedes-benz-gls-450-white-ca', NULL,
    2026, 'Mercedes-Benz', 'GLS 450', 'Base', 'SUV', 'Gas', 'Polar White', 'Black',
    'Lease', 99000, 93000, 899, 3500, 36, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 59, '2026-05-06'::date,
    'NEW', '7-seater. Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household. $699 broker fee is included in the due-at-signing total above.', ARRAY['7-Seater', 'Running Boards']::text[], ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/A6ZVqgdvNgOXXRFeSA7pCkZUeruSm8O3Jo2-SqimNwWgcLZQmer8E9O3RCE7dJyYLRpsGp3b_QqnZga4gStJsK5g1UZoPY4y12M87lYgFM1Dyn5-nSLUcd_dGzzsmvKkQ-48RWilI_UmCyBNTMUgDQuJH3-D521OFUJFNwMCHcfduxlv-U6i7ZM1zGpYNhwi/cc_2026MBS631971493_01_640_040.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811', false, false,
    'published'
  ),
  (
    '2026-mercedes-benz-cle53-amg-coupe-blue-ca', NULL,
    2026, 'Mercedes-Benz', 'CLE 53 AMG Coupe', '4MATIC', 'Coupe', 'Gas', 'Starling Blue', 'Black',
    'Lease', 91000, 86000, 859, 3500, 24, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 63, '2026-05-06'::date,
    'HOT', 'Payment is +tax. Requires Conquest — an eligible 2020+ vehicle currently registered to you or someone in your household. $699 broker fee is included in the due-at-signing total above.', ARRAY['Pinnacle Trim', 'AMG Carbon Fiber', '20" AMG Y-Design Wheels']::text[], ARRAY['https://pub-2581946c35634f46958be8b522976200.r2.dev/2026-Mercedes-Benz-CLE-AMG-CLE-53-4MATIC+-Coupe-PSRQ-Starling-Blue-Metallic-970.webp']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-benz-porsche-exotics-glb-179-3-5k-glc-279-3-5k-911-4s-1499-5k/759811', false, false,
    'published'
  ),
  (
    '2026-porsche-cayenne-black-ca', NULL,
    2026, 'Porsche', 'Cayenne', 'Base', 'SUV', 'Gas', 'Black', 'Black',
    'Lease', 104000, 98000, 1179, 3500, 39, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 56, '2026-07-03'::date,
    'NEW', 'Payment is +tax. $699 broker fee is included in the due-at-signing total above.', ARRAY['21" RS Spyder Design Wheels', 'Bose Surround Sound']::text[], ARRAY['https://vehicle-images.carscommerce.inc/stock-images/chrome/a0d9861200321d9920b42359c78f8bfc.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167', false, false,
    'published'
  ),
  (
    '2026-porsche-panamera-ca', NULL,
    2026, 'Porsche', 'Panamera', 'Base', 'Sedan', 'Gas', 'Provence', 'Black',
    'Lease', 130000, 122000, 1599, 4000, 39, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 52, '2026-07-03'::date,
    'NEW', 'Payment is +tax. $699 broker fee is included in the due-at-signing total above.', '{}', ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/OO0oYT4gvcinee8qh7E42h-JRo4qfmVAaV4u0bRIt5H9NdFIRA_JHTqOW6nLSUwdAosD5_nMkAYeLxNVEhd8LxLiR5k7hZqmle9E6kBQtEX3E6ZoDBlJeoah8LUTmAo_8ldIiEqqfSMmgvPf2eHXNzmJ2SQU-XlKMIJoKggQ338/cc_2026PRC101979607_01_640_A1.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167', false, false,
    'published'
  ),
  (
    '2026-land-rover-range-rover-evoque-blue-ca', NULL,
    2026, 'Land Rover', 'Range Rover Evoque', 'Core S AWD', 'SUV', 'Gas', 'Tribeca Blue Metallic', 'Ebony',
    'Lease', 57000, 53000, 629, 4000, 36, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 45, '2026-07-03'::date,
    'VALUE', 'Payment is +tax. Requires a qualifying conquest incentive — confirm current eligibility with broker. $599 broker fee is included in the due-at-signing total above.', '{}', ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/5MUaBu0KmqADayDAt3BDFnHAPcBgxUUaIsCkkCrbiTHFtfZP1Er8jO2H1GyaMIWI-SbVlyzquVsh8krJ4Ocxmg9ikphqTy_brq6gxmRfjOwVWlri4pIiaw8GCWj5KTT42AOBQgFPkCxOlFlXCvN0bkI4uzdWgrF4lAbTQPO3wfY/cc_2026LRS101942839_01_640_1FV.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167', false, false,
    'published'
  ),
  (
    '2026-land-rover-range-rover-velar-p250-ca', NULL,
    2026, 'Land Rover', 'Range Rover Velar', 'P250 S', 'SUV', 'Gas', 'Santorini Black Metallic', 'Ebony',
    'Lease', 71000, 67000, 714, 4000, 36, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 43, '2026-07-03'::date,
    'NEW', 'Payment is +tax. Requires a qualifying conquest incentive — confirm current eligibility with broker. $599 broker fee is included in the due-at-signing total above.', '{}', ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/5MUaBu0KmqAD5cudKFDps7olY_R1WkPc0y1uUTvcJvN6lmeRdckDtxH8BlKBDTAa90wFRLknVcB18lBFIeuciuPLA9FHIn9gyfXOL5mDUfSaxIm-8fG0C-srxUfwE7iAfq0tBDiGWxTkexd14FoiYA4CEWBC89S8WY3UTJ5WGfF1GLvEy1BL3g/cc_2026LRS122044623_01_640_1EH.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167', false, false,
    'published'
  ),
  (
    '2026-land-rover-defender-110-gray-ca', NULL,
    2026, 'Land Rover', 'Defender 110', 'P400 X-Dynamic SE', 'SUV', 'Gas', 'Borasco Grey Metallic', 'Ebony',
    'Lease', 94000, 88000, 1069, 4000, 36, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 60, '2026-07-03'::date,
    'HOT', 'Interior trim not specified by broker; shown as manufacturer-standard Ebony — confirm exact spec before signing. Also available in Black, Dark Grey, and Light Grey. Payment is +tax. Requires a qualifying conquest incentive — confirm current eligibility with broker. $599 broker fee is included in the due-at-signing total above.', '{}', ARRAY['https://media.chromedata.com/MediaGallery/media/MjkzOTU4Xk1lZGlhIEdhbGxlcnk/5MUaBu0KmqAT6MZYXbuUmh24enC1a7JKB8ftzqK6q6xsG3rHct4EW6fSeGp_9mVCjSkzAUUenQXk4zxXjPEitFbtRn4vhZ7O7ChfsmxBUXmVryYbUgaEH-XhfvfRwc0AM3yb4RzrbSKgv14dJhD2lgG7yptJYd9Zmuq3arTr_Fk/cc_2026LRS132046010_01_640_1CN.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167', false, false,
    'published'
  ),
  (
    '2023-bentley-bentayga-ewb-v8-ca', NULL,
    2023, 'Bentley', 'Bentayga EWB', 'V8', 'SUV', 'Gas', 'Onyx', 'Linen',
    'Lease', 285000, 260000, 1675, 10000, 24, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 71, '2026-07-07'::date,
    'HOT', 'Extended wheelbase V8. Payment is +tax. $1,299 broker fee is included in the due-at-signing total above.', '{}', ARRAY['https://static.tcimg.net/vehicles/primary/f3f14dd92d0777c7/2023-Bentley-Bentayga-gray-full_color-driver_side_profile.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167', false, false,
    'published'
  ),
  (
    '2026-lamborghini-urus-se-demo-ca', NULL,
    2026, 'Lamborghini', 'Urus SE', 'Demo', 'SUV', 'PHEV', 'Blu Cepheus', 'Black w/ Orange Stitching',
    'Lease', 342000, 328000, 0, 55999, 12, 7500, NULL,
    'Broker', 'Chrome Stallions', '949-763-5609', 'sales@chromestallions.com', 'Los Angeles', 'CA',
    true, true, 74, '2026-07-09'::date,
    'HOT', 'One-pay lease — the full $55,999 (7.75% effective rate) is paid upfront and covers the entire 12-month term with no separate monthly bill. Demo unit; broker notes an incoming unit is expected any day. $999 broker fee is included in the one-pay total above. Photo shown is the factory Urus SE in stock trim — exact color match not available; confirm current color with broker.', '{}', ARRAY['https://www.lamborghini.com/sites/it-en/files/DAM/lamborghini/0_facelift_2025/gateway_family/urus/Urus%20SE%20Performante-modelChooser-mobile_v2.png']::text[],
    'https://forum.leasehackr.com/t/chrome-stallions-exotics-porsche-benteyga-1675-10k-911-4s-1499-5k-urus-se-onepay-54-999/770167', false, true,
    'published'
  )
on conflict (slug) do nothing;
