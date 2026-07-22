-- Adds:
--  - deals.condition: replaces the old always-true "verified" badge with a
--    real, broker-picked condition (New/Loaner/Demo/CPO/Used) shown on the
--    listing photo.
--  - deals.incentives: broker-managed list of stackable incentives
--    (loyalty, fleet, military, etc.) a shopper can toggle on the deal page
--    to see the effect on their estimated payment. AI can suggest starting
--    points, but the broker always reviews/edits before publishing.
--  - deals.photo_auto_sourced: true when the image came from our CarsXE
--    lookup or the generic placeholder rather than a broker upload, so the
--    UI can disclose "may not be the exact vehicle."
--  - brokers.contact_name: the individual's name, alongside their existing
--    business_name.

alter table public.deals
  add column if not exists condition text
    check (condition in ('New', 'Loaner', 'Demo', 'CPO', 'Used')),
  add column if not exists incentives jsonb not null default '[]'::jsonb,
  add column if not exists photo_auto_sourced boolean not null default false;

alter table public.brokers
  add column if not exists contact_name text,
  add column if not exists about text;

-- Public "About this broker" page: anyone can view a broker's profile
-- (business name, city/state, phone, about text) the same way anyone can
-- already view their listings — nothing here is more sensitive than what's
-- already shown on every one of their deal cards.
drop policy if exists "Anyone can view broker profiles" on public.brokers;
create policy "Anyone can view broker profiles"
  on public.brokers for select
  using (true);

-- Two new submission source types: a broker typing up deals in plain text,
-- or uploading a screenshot — both read by AI into draft listings the same
-- way the Excel/Google Sheet parsers work.
alter table public.submissions
  drop constraint if exists submissions_source_type_check;
alter table public.submissions
  add constraint submissions_source_type_check
  check (source_type in ('link', 'google_sheet', 'excel_file', 'manual', 'free_text', 'screenshot'));
