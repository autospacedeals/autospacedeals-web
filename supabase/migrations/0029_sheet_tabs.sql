-- Multi-tab Google Sheets: the sync reads every visible tab, and a broker
-- can switch individual tabs off (e.g. an outdated one) and back on.
--
--   sheet_syncs.tabs           tab names found on the last read, in order
--   sheet_syncs.disabled_tabs  tabs the broker switched off; a new tab is
--                              on by default, so only the "off" ones are kept
--   sheet_syncs.row_cache      what each sheet row parsed to last time, so a
--                              sync only re-reads new or changed rows
--   deals.sheet_tab            which tab a synced car came from
--
-- Safe to re-run.
alter table public.sheet_syncs add column if not exists tabs text[] not null default '{}';
alter table public.sheet_syncs add column if not exists disabled_tabs text[] not null default '{}';
alter table public.sheet_syncs add column if not exists row_cache jsonb not null default '{}'::jsonb;

alter table public.deals add column if not exists sheet_tab text;
