-- A seller's website can be kept synced like a Google Sheet (lib/sheet-sync.ts,
-- lib/website-inventory.ts): sheet_syncs.source says which, and a website
-- sync keeps the site's address in sheet_url.
--
-- Safe to re-run.

alter table public.sheet_syncs add column if not exists source text not null default 'google_sheet';
alter table public.sheet_syncs drop constraint if exists sheet_syncs_source_check;
alter table public.sheet_syncs add constraint sheet_syncs_source_check check (source in ('google_sheet', 'website'));
